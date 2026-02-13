import { OPENROUTER_CONFIG } from "@/lib/backend/config";
import type { UnknownRecord } from "@/lib/backend/types";

type OpenRouterMessage = {
  role: string;
  content: string;
};

type CallOpenRouterOptions = {
  max_tokens?: number;
  reasoning?: UnknownRecord;
  response_format?: UnknownRecord;
  provider?: UnknownRecord;
  api_url?: string;
  timeout?: number;
  headers?: Record<string, string>;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function contentFromParts(content: unknown): string | undefined {
  if (typeof content === "string" && content) {
    return content;
  }
  if (isRecord(content)) {
    return JSON.stringify(content);
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!isRecord(item)) {
        continue;
      }
      const itemType = item.type;
      const text = item.text;
      if (
        (itemType === "text" || itemType === "output_text") &&
        typeof text === "string"
      ) {
        parts.push(text);
      }
    }
    if (parts.length > 0) {
      return parts.join("");
    }
  }
  return undefined;
}

function extractParsedJson(response: unknown): UnknownRecord | undefined {
  if (!isRecord(response)) {
    return undefined;
  }
  if (isRecord(response.parsed)) {
    return response.parsed;
  }

  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    return undefined;
  }
  const message = choices[0].message;
  if (!isRecord(message)) {
    return undefined;
  }

  if (isRecord(message.parsed)) {
    return message.parsed;
  }
  if (isRecord(message.content)) {
    return message.content;
  }
  return undefined;
}

function extractContent(response: unknown): string {
  if (!isRecord(response)) {
    return "";
  }

  const topLevel = contentFromParts(response.content);
  if (topLevel) {
    return topLevel;
  }

  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0 || !isRecord(choices[0])) {
    return "";
  }
  const first = choices[0];
  const message = isRecord(first.message) ? first.message : {};
  const fromMessage = contentFromParts(message.content);
  if (fromMessage) {
    return fromMessage;
  }
  return typeof first.text === "string" ? first.text : "";
}

function stripCodeFences(text: string): string {
  let stripped = text.trim();
  if (stripped.startsWith("```")) {
    stripped = stripped.split("\n", 2)[1] ?? "";
  }
  if (stripped.endsWith("```")) {
    const lines = stripped.split("\n");
    lines.pop();
    stripped = lines.join("\n");
  }
  return stripped.trim();
}

function parseJsonContent(content: string): UnknownRecord | undefined {
  if (!content) {
    return undefined;
  }

  const text = stripCodeFences(content);
  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function callOpenRouter(
  model: string,
  messages: OpenRouterMessage[],
  options: CallOpenRouterOptions = {},
): Promise<UnknownRecord | null> {
  const apiKey = OPENROUTER_CONFIG.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }
  const targetUrl = options.api_url ?? OPENROUTER_CONFIG.OPENROUTER_API_URL;
  if (!targetUrl) {
    return null;
  }

  const payload: UnknownRecord = { model, messages };
  if (options.max_tokens !== undefined) {
    payload.max_tokens = options.max_tokens;
  }
  if (options.reasoning !== undefined) {
    payload.reasoning = options.reasoning;
  }
  if (options.response_format !== undefined) {
    payload.response_format = options.response_format;
  }
  if (options.provider !== undefined) {
    payload.provider = options.provider;
  }

  const controller = new AbortController();
  const timeoutMs = (options.timeout ?? 120) * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = { content: text };
      }
    }
    if (!response.ok) {
      return {
        error: "HTTPError",
        status: response.status,
        reason: response.statusText,
        body: text,
      };
    }
    return isRecord(parsed) ? parsed : { raw: parsed, content: text };
  } catch (error) {
    return {
      error: "UnexpectedError",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseOpenRouterJson(response: unknown): {
  parsed: UnknownRecord | undefined;
  content: string;
} {
  const parsedJson = extractParsedJson(response);
  if (parsedJson) {
    return { parsed: parsedJson, content: JSON.stringify(parsedJson) };
  }

  const content = extractContent(response);
  const parsed = parseJsonContent(content);
  return { parsed, content };
}
