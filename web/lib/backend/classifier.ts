import { DEFAULT_LABELS, OPENROUTER_CONFIG } from "@/lib/backend/config";
import {
  fetchUnreadMessageDetails,
  normalizeEmailDetails,
} from "@/lib/backend/gmail";
import { callOpenRouter, parseOpenRouterJson } from "@/lib/backend/openrouter";
import type {
  ClassificationItem,
  ClassificationResult,
  EmailDetails,
  UnknownRecord,
} from "@/lib/backend/types";

type ClassifyOptions = {
  model?: string;
  labels?: string[];
  max_tokens?: number;
  exclude_reasoning?: boolean;
  use_structured_output?: boolean;
  api_url?: string;
  timeout?: number;
};

type ClassifyUnreadOptions = ClassifyOptions & {
  max_results?: number;
  label_ids?: string[];
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeResultItem(raw: UnknownRecord): ClassificationItem {
  return {
    id: safeString(raw.id ?? raw.message_id ?? raw.email_id),
    label: safeString(
      raw.label ?? raw.classificazione ?? raw.classification ?? raw.category,
    ),
    summary: safeString(
      raw.summary ?? raw.riassunto ?? raw.sommario ?? raw.description,
    ),
    subject: safeString(raw.subject ?? raw.oggetto),
    sender: safeString(raw.sender ?? raw.mittente ?? raw.from),
  };
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null
    ? (value as UnknownRecord)
    : undefined;
}

function extractItemsFromParsed(parsed: UnknownRecord): ClassificationItem[] {
  let listCandidate: unknown;
  for (const key of ["items", "emails", "results"]) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      listCandidate = value;
      break;
    }
  }

  if (!listCandidate) {
    const hasSingle =
      parsed.label !== undefined ||
      parsed.summary !== undefined ||
      parsed.classificazione !== undefined ||
      parsed.riassunto !== undefined ||
      parsed.subject !== undefined ||
      parsed.sender !== undefined;
    if (!hasSingle) {
      return [];
    }
    listCandidate = [parsed];
  }

  const normalized: ClassificationItem[] = [];
  for (const item of listCandidate as unknown[]) {
    const raw = asRecord(item);
    if (raw) {
      normalized.push(normalizeResultItem(raw));
    }
  }
  return normalized;
}

function parseLooseJson(text: string): UnknownRecord | undefined {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.includes("{") && !trimmed.includes("["))) {
    return undefined;
  }

  const tryParse = (value: string): UnknownRecord | undefined => {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return undefined;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) {
    return direct;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParse(trimmed.slice(start, end + 1));
  }
  return undefined;
}

function extractItemsFromAny(value: unknown): ClassificationItem[] {
  const stack: unknown[] = [value];
  const seen = new Set<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (typeof current === "string") {
      const parsed = parseLooseJson(current);
      if (parsed) {
        stack.push(parsed);
      }
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    const record = asRecord(current);
    if (!record) {
      continue;
    }
    if (seen.has(record)) {
      continue;
    }
    seen.add(record);

    const direct = extractItemsFromParsed(record);
    if (direct.length > 0) {
      return direct;
    }

    for (const value of Object.values(record)) {
      if (typeof value === "string") {
        const parsed = parseLooseJson(value);
        if (parsed) {
          stack.push(parsed);
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return [];
}

function buildSystemPrompt(labels: string[]): string {
  const labelList = labels.join(", ");
  return (
    "Sei un assistente esperto in triage di email e gestione documentale. " +
    "Il tuo compito e analizzare le email e trasformarle in dati strutturati. " +
    `\n\n1. CLASSIFICAZIONE: Usa esclusivamente UN label scelto tra: [${labelList}]. ` +
    "Non inventare mai etichette non presenti in lista. " +
    "\n2. RIASSUNTO: Scrivi una sintesi professionale di 1-2 frasi (max 280 caratteri). " +
    "Focus sull'obiettivo del mittente e sulle eventuali azioni richieste. " +
    "\n3. CAMPI: Includi sempre subject e sender esattamente come presenti nell'input. " +
    "\n4. FORMATO: Segui rigorosamente lo schema JSON richiesto da response_format."
  );
}

function buildMessages(emailPayloads: UnknownRecord[], labels: string[]) {
  const systemPrompt = buildSystemPrompt(labels);
  const userContent = JSON.stringify({ emails: emailPayloads });
  const combined = `${systemPrompt}\n\nInput JSON:\n${userContent}`;
  return [{ role: "user", content: combined }];
}

function buildStructuredOutputFormat(labels: string[]): UnknownRecord {
  return {
    type: "json_schema",
    json_schema: {
      name: "gmail_triage_output",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "label", "summary", "subject", "sender"],
              properties: {
                id: { type: "string" },
                label: { type: "string", enum: labels },
                summary: { type: "string", maxLength: 280 },
                subject: { type: "string" },
                sender: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

export async function classifyAndSummarizeMessages(
  emailDetails: EmailDetails[],
  options: ClassifyOptions = {},
): Promise<ClassificationResult> {
  if (!emailDetails.length) {
    return { items: [] };
  }

  const chosenModel = options.model ?? OPENROUTER_CONFIG.MODEL;
  if (!chosenModel) {
    throw new Error("MODEL is missing. Set MODEL in .env or pass model.");
  }

  const chosenLabels = options.labels ?? DEFAULT_LABELS;
  const payloads = emailDetails.map((item) =>
    normalizeEmailDetails(item),
  ) as UnknownRecord[];
  const messages = buildMessages(payloads, chosenLabels);
  const useStructured = options.use_structured_output ?? true;
  const response = await callOpenRouter(chosenModel, messages, {
    max_tokens: options.max_tokens ?? 800,
    reasoning: options.exclude_reasoning ?? true ? { exclude: true } : undefined,
    response_format: useStructured
      ? buildStructuredOutputFormat(chosenLabels)
      : undefined,
    provider: useStructured ? { require_parameters: true } : undefined,
    api_url: options.api_url,
    timeout: options.timeout ?? 120,
  });

  if (!response) {
    return { items: [], error: "No response from OpenRouter." };
  }
  if (response.error && !response.choices) {
    return { items: [], error: "OpenRouter error", details: response };
  }

  const { parsed, content } = parseOpenRouterJson(response);
  if (parsed) {
    const items = extractItemsFromAny(parsed);
    const subjectById = new Map(payloads.map((item) => [safeString(item.id), safeString(item.subject)]));
    const senderById = new Map(payloads.map((item) => [safeString(item.id), safeString(item.sender)]));
    for (const item of items) {
      if (item.id && !item.subject) {
        item.subject = subjectById.get(item.id) ?? "";
      }
      if (item.id && !item.sender) {
        item.sender = senderById.get(item.id) ?? "";
      }
    }
    if (items.length > 0) {
      return { items };
    }
    return {
      items: [],
      error: "Parsed OpenRouter response but found no classification items.",
      raw_content: content,
      raw_response: response,
    };
  }

  return {
    items: [],
    error: "Failed to parse JSON response.",
    raw_content: content,
    raw_response: response,
  };
}

export async function classifyUnreadGmail(
  options: ClassifyUnreadOptions = {},
): Promise<ClassificationResult> {
  const details = await fetchUnreadMessageDetails(
    options.max_results ?? 5,
    "me",
    options.label_ids ?? ["INBOX", "UNREAD"],
  );
  if (!details.length) {
    return {
      items: [],
      error: "No unread messages found for the requested labels.",
    };
  }

  return classifyAndSummarizeMessages(details, options);
}
