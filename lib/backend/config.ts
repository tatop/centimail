import fs from "node:fs";
import path from "node:path";

export const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
export const DEFAULT_LABELS = [
  "azione_richiesta",
  "informazione",
  "importante",
  "non_importante",
];
export const MAX_BODY_CHARS = 4000;

type OpenRouterConfig = {
  MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_API_URL?: string;
};

function detectRepoRoot(): string {
  const cwd = process.cwd();
  if (
    fs.existsSync(path.join(cwd, "app")) &&
    fs.existsSync(path.join(cwd, "next.config.ts"))
  ) {
    return cwd;
  }

  if (
    fs.existsSync(path.join(cwd, "lib")) &&
    fs.existsSync(path.join(cwd, "..", "next.config.ts"))
  ) {
    return path.resolve(cwd, "..");
  }

  const parent = path.resolve(cwd, "..");
  if (
    fs.existsSync(path.join(parent, "app")) &&
    fs.existsSync(path.join(parent, "next.config.ts"))
  ) {
    return parent;
  }

  return cwd;
}

const REPO_ROOT = detectRepoRoot();
const ENV_PATH = path.join(REPO_ROOT, ".env");

const TOKEN_PATH = path.join(REPO_ROOT, "token.json");
const CREDENTIALS_PATH = path.join(REPO_ROOT, "credentials.json");

function stripQuoted(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readDotEnvFile(dotenvPath: string): Record<string, string> {
  if (!fs.existsSync(dotenvPath)) {
    return {};
  }

  const raw = fs.readFileSync(dotenvPath, "utf-8");
  const output: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = stripQuoted(trimmed.slice(eq + 1).trim());
    if (key) {
      output[key] = value;
    }
  }

  return output;
}

export function loadOpenRouterConfig(dotenvPath: string = ENV_PATH): OpenRouterConfig {
  const fileConfig = readDotEnvFile(dotenvPath);

  return {
    MODEL: fileConfig.MODEL ?? process.env.MODEL,
    OPENROUTER_API_KEY:
      fileConfig.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY,
    OPENROUTER_API_URL:
      fileConfig.OPENROUTER_API_URL ?? process.env.OPENROUTER_API_URL,
  };
}

export const OPENROUTER_CONFIG = loadOpenRouterConfig();
export { CREDENTIALS_PATH, ENV_PATH, REPO_ROOT, TOKEN_PATH };
