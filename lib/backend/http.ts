import type { EmailDetails, UnknownRecord } from "@/lib/backend/types";

export class BadRequestError extends Error {}

const MAX_RESULTS_LIMIT = 25;
const MAX_TOKENS_LIMIT = 2_000;
const MAX_EMAILS_LIMIT = 50;

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError("Invalid JSON body.");
  }
  return value as UnknownRecord;
}

function asStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new BadRequestError(`${field} must be an array of strings.`);
  }
  return value as string[];
}

function asBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw new BadRequestError(`${field} must be a boolean.`);
  }
  return value;
}

function asPositiveInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new BadRequestError(`${field} must be an integer >= 1.`);
  }
  return value as number;
}

function asBoundedInt(
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number {
  const parsed = asPositiveInt(value, field, fallback);
  if (parsed > max) {
    throw new BadRequestError(`${field} must be <= ${max}.`);
  }
  return parsed;
}

function asPositiveFloat(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestError(`${field} must be a number > 0.`);
  }
  return value;
}

function asOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BadRequestError(`${field} must be a string.`);
  }
  return value;
}

function rejectForbiddenField(value: UnknownRecord, field: string): void {
  if (value[field] !== undefined) {
    throw new BadRequestError(`${field} is not allowed.`);
  }
}

export type ClassifyUnreadRequest = {
  max_results: number;
  label_ids?: string[];
  model?: string;
  labels?: string[];
  max_tokens: number;
  include_reasoning: boolean;
  use_structured_output: boolean;
  timeout: number;
};

export type ClassifyEmailsRequest = {
  emails: EmailDetails[];
  model?: string;
  labels?: string[];
  max_tokens: number;
  include_reasoning: boolean;
  use_structured_output: boolean;
  timeout: number;
};

export function parseClassifyUnreadRequest(body: unknown): ClassifyUnreadRequest {
  const value = asRecord(body);
  rejectForbiddenField(value, "api_url");

  return {
    max_results: asBoundedInt(value.max_results, "max_results", 5, MAX_RESULTS_LIMIT),
    label_ids: asStringArray(value.label_ids, "label_ids"),
    model: asOptionalString(value.model, "model"),
    labels: asStringArray(value.labels, "labels"),
    max_tokens: asBoundedInt(value.max_tokens, "max_tokens", 800, MAX_TOKENS_LIMIT),
    include_reasoning: asBoolean(value.include_reasoning, "include_reasoning", false),
    use_structured_output: asBoolean(
      value.use_structured_output,
      "use_structured_output",
      true,
    ),
    timeout: asPositiveFloat(value.timeout, "timeout", 120),
  };
}

function parseEmailInput(input: unknown, index: number): EmailDetails {
  const value = asRecord(input);
  const parseOptionalStringField = (field: string) =>
    asOptionalString(value[field], `emails[${index}].${field}`);
  const attachmentsRaw = value.attachments;
  const attachments =
    attachmentsRaw === undefined || attachmentsRaw === null
      ? undefined
      : asBoolean(attachmentsRaw, `emails[${index}].attachments`, false);

  return {
    id: parseOptionalStringField("id"),
    message_id: parseOptionalStringField("message_id"),
    subject: parseOptionalStringField("subject"),
    sender: parseOptionalStringField("sender"),
    date_time: parseOptionalStringField("date_time"),
    snippet: parseOptionalStringField("snippet"),
    attachments,
    body: parseOptionalStringField("body"),
  };
}

export function parseClassifyEmailsRequest(body: unknown): ClassifyEmailsRequest {
  const value = asRecord(body);
  rejectForbiddenField(value, "api_url");

  if (value.emails !== undefined && !Array.isArray(value.emails)) {
    throw new BadRequestError("emails must be an array.");
  }
  const emailsRaw = Array.isArray(value.emails) ? value.emails : [];
  if (emailsRaw.length > MAX_EMAILS_LIMIT) {
    throw new BadRequestError(`emails must contain at most ${MAX_EMAILS_LIMIT} items.`);
  }

  return {
    emails: emailsRaw.map((item, index) => parseEmailInput(item, index)),
    model: asOptionalString(value.model, "model"),
    labels: asStringArray(value.labels, "labels"),
    max_tokens: asBoundedInt(value.max_tokens, "max_tokens", 800, MAX_TOKENS_LIMIT),
    include_reasoning: asBoolean(value.include_reasoning, "include_reasoning", false),
    use_structured_output: asBoolean(
      value.use_structured_output,
      "use_structured_output",
      true,
    ),
    timeout: asPositiveFloat(value.timeout, "timeout", 120),
  };
}
