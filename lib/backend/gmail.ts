import fs from "node:fs";

import {
  CREDENTIALS_PATH,
  MAX_BODY_CHARS,
  SCOPES,
  TOKEN_PATH,
} from "@/lib/backend/config";
import type {
  EmailDetails,
  NormalizedEmailDetails,
  UnknownRecord,
} from "@/lib/backend/types";

type GoogleInstalledClient = {
  client_id: string;
  client_secret: string;
  token_uri?: string;
};

type GoogleCredentialsFile = {
  installed?: GoogleInstalledClient;
  web?: GoogleInstalledClient;
};

type StoredToken = {
  token?: string;
  refresh_token?: string;
  token_uri?: string;
  client_id?: string;
  client_secret?: string;
  expiry?: string;
  scopes?: string[];
};

type GmailListResponse = {
  messages?: Array<{ id: string }>;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

type GmailMessage = {
  id?: string;
  snippet?: string;
  payload?: GmailPart;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

function loadGoogleClient(): GoogleInstalledClient {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Missing credentials file at ${CREDENTIALS_PATH}`);
  }

  const parsed = readJsonFile(CREDENTIALS_PATH) as GoogleCredentialsFile;
  const client = parsed.installed ?? parsed.web;
  if (!client?.client_id || !client.client_secret) {
    throw new Error("Invalid credentials.json format.");
  }
  return client;
}

function loadStoredToken(): StoredToken | null {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  const parsed = readJsonFile(TOKEN_PATH);
  return isRecord(parsed) ? (parsed as StoredToken) : null;
}

function saveStoredToken(token: StoredToken): void {
  fs.writeFileSync(TOKEN_PATH, `${JSON.stringify(token, null, 2)}\n`, "utf-8");
}

function hasUsableToken(token: StoredToken): boolean {
  if (!token.token) {
    return false;
  }
  if (!token.expiry) {
    return true;
  }
  const expiryMs = Date.parse(token.expiry);
  if (Number.isNaN(expiryMs)) {
    return true;
  }
  return expiryMs > Date.now() + 60_000;
}

async function refreshToken(token: StoredToken): Promise<StoredToken> {
  const client = loadGoogleClient();
  const refreshTokenValue = token.refresh_token;
  if (!refreshTokenValue) {
    throw new Error(
      `Missing refresh token in ${TOKEN_PATH}. Recreate token.json via OAuth once.`,
    );
  }

  const tokenUri = token.token_uri ?? client.token_uri ?? "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshTokenValue,
    grant_type: "refresh_token",
  });

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as UnknownRecord;
  if (!response.ok) {
    throw new Error(
      `Google token refresh failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : undefined;
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : undefined;
  const refreshedToken =
    typeof payload.refresh_token === "string"
      ? payload.refresh_token
      : refreshTokenValue;

  if (!accessToken) {
    throw new Error("Google refresh response missing access_token.");
  }

  const nextToken: StoredToken = {
    ...token,
    token: accessToken,
    refresh_token: refreshedToken,
    token_uri: tokenUri,
    client_id: client.client_id,
    client_secret: client.client_secret,
    scopes: token.scopes ?? SCOPES,
  };

  if (expiresIn) {
    nextToken.expiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  }

  saveStoredToken(nextToken);
  return nextToken;
}

async function getAccessToken(): Promise<string> {
  const token = loadStoredToken();
  if (!token) {
    throw new Error(
      `Missing ${TOKEN_PATH}. Run OAuth bootstrap once to generate token.json.`,
    );
  }
  if (hasUsableToken(token)) {
    return token.token as string;
  }
  const refreshed = await refreshToken(token);
  if (!refreshed.token) {
    throw new Error("Unable to obtain Gmail access token.");
  }
  return refreshed.token;
}

async function gmailGet<T>(
  apiPath: string,
  accessToken: string,
  params: URLSearchParams,
): Promise<T> {
  const url = `https://gmail.googleapis.com/gmail/v1/${apiPath}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(
      `Gmail API ${apiPath} failed (${response.status}): ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`,
    );
  }
  return body as T;
}

function headerMap(headers: GmailHeader[] | undefined): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!headers) {
    return mapped;
  }

  for (const header of headers) {
    const name =
      typeof header.name === "string" ? header.name.toLowerCase() : undefined;
    if (!name || mapped[name]) {
      continue;
    }
    mapped[name] = typeof header.value === "string" ? header.value : "";
  }
  return mapped;
}

function decodeBody(data: string | undefined): string {
  if (!data) {
    return "";
  }

  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf-8");
}

function* iterParts(payload: GmailPart | undefined): Generator<GmailPart> {
  if (!payload) {
    return;
  }
  const stack: GmailPart[] = [payload];
  while (stack.length > 0) {
    const current = stack.pop() as GmailPart;
    yield current;
    for (const part of current.parts ?? []) {
      stack.push(part);
    }
  }
}

function bodyAndAttachments(payload: GmailPart | undefined): {
  body: string;
  attachments: boolean;
} {
  const plainChunks: string[] = [];
  const htmlChunks: string[] = [];
  let attachments = false;

  for (const part of iterParts(payload)) {
    const body = part.body ?? {};
    if (part.filename || body.attachmentId) {
      attachments = true;
    }
    if (!body.data) {
      continue;
    }
    const decoded = decodeBody(body.data);
    if (part.mimeType === "text/plain") {
      plainChunks.push(decoded);
    } else if (part.mimeType === "text/html") {
      htmlChunks.push(decoded);
    }
  }

  return {
    body: (plainChunks.length > 0 ? plainChunks : htmlChunks).join("\n\n"),
    attachments,
  };
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n\n[truncated]`;
}

function normalizeDate(dateHeader: string | undefined): string {
  if (!dateHeader) {
    return "Unknown date";
  }
  const parsed = new Date(dateHeader);
  if (Number.isNaN(parsed.getTime())) {
    return dateHeader;
  }
  return parsed.toISOString();
}

function getDetails(message: GmailMessage): EmailDetails {
  const payload = message.payload;
  const headers = headerMap(payload?.headers);
  const parsed = bodyAndAttachments(payload);

  return {
    subject: headers.subject || "No subject",
    sender: headers.from || "Unknown sender",
    date_time: normalizeDate(headers.date),
    snippet: typeof message.snippet === "string" ? message.snippet : "",
    attachments: parsed.attachments,
    body: parsed.body,
  };
}

export function normalizeEmailDetails(details: EmailDetails): NormalizedEmailDetails {
  const body = details.body ?? "";
  return {
    id: details.message_id ?? details.id ?? "",
    subject: details.subject ?? "",
    sender: details.sender ?? "",
    date_time: details.date_time ?? "",
    snippet: details.snippet ?? "",
    attachments: Boolean(details.attachments),
    body: truncate(body, MAX_BODY_CHARS),
  };
}

export async function fetchUnreadMessageDetails(
  maxResults: number = 2,
  userId: string = "me",
  labelIds: string[] = ["INBOX", "UNREAD"],
): Promise<EmailDetails[]> {
  const accessToken = await getAccessToken();
  const listParams = new URLSearchParams({ maxResults: String(maxResults) });
  for (const labelId of labelIds) {
    listParams.append("labelIds", labelId);
  }

  const list = await gmailGet<GmailListResponse>(
    `users/${encodeURIComponent(userId)}/messages`,
    accessToken,
    listParams,
  );
  const messages = Array.isArray(list.messages) ? list.messages : [];

  const details = await Promise.all(
    messages.map(async (message) => {
      const getParams = new URLSearchParams({ format: "full" });
      const full = await gmailGet<GmailMessage>(
        `users/${encodeURIComponent(userId)}/messages/${encodeURIComponent(message.id)}`,
        accessToken,
        getParams,
      );
      const item = getDetails(full);
      item.message_id = message.id;
      return item;
    }),
  );

  return details;
}
