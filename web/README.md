# Web (Next.js + Bun)

Unified app/runtime for Gmail classifier.

## Install

```bash
bun install
```

## Development

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
bun run build
bun run start
```

## API routes

- `GET /health`
- `POST /api/classify/unread`
- `POST /api/classify/emails`

## Config sources

The backend layer reads values from:

1. process environment
2. repo-root `.env`

Expected keys:

- `MODEL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_API_URL`

OAuth files are read from repo root:

- `credentials.json`
- `token.json`
