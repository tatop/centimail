export type UnknownRecord = Record<string, unknown>;

export type EmailDetails = {
  id?: string;
  message_id?: string;
  subject?: string;
  sender?: string;
  date_time?: string;
  snippet?: string;
  attachments?: boolean;
  body?: string;
};

export type NormalizedEmailDetails = {
  id: string;
  subject: string;
  sender: string;
  date_time: string;
  snippet: string;
  attachments: boolean;
  body: string;
};

export type ClassificationItem = {
  id: string;
  label: string;
  summary: string;
  subject: string;
  sender: string;
};

export type ClassificationResult = {
  items: ClassificationItem[];
  error?: string;
  details?: unknown;
  raw_content?: string;
  raw_response?: unknown;
};
