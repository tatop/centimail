# Gmail + OpenRouter

Unified Gmail triage app with Next.js (App Router) + Bun.

- UI and API live at repo root (`app/` + `lib/`)
- API fetches unread Gmail emails and classifies/summarizes with OpenRouter
- Python backend has been removed

## Requirements

- Bun
- Node.js 20+
- `credentials.json` at repo root (Google OAuth client)
- `token.json` at repo root (Google token; refreshed automatically)
- `.env` at repo root with OpenRouter config

```env
MODEL=your-openrouter-model
OPENROUTER_API_KEY=your-key
OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions
```

## Run

```bash
bun install
bun run dev
```

App: [http://localhost:3000](http://localhost:3000)

## API (Next.js)

- `GET /health`
- `POST /api/classify/unread`
- `POST /api/classify/emails`

Example:

```bash
curl -X POST http://localhost:3000/api/classify/unread \
  -H 'Content-Type: application/json' \
  -d '{"max_results":5,"use_structured_output":true}'
```

## Notes

- Keep `credentials.json`, `token.json`, and `.env` uncommitted.
- Gmail scope is readonly (`https://www.googleapis.com/auth/gmail.readonly`).
- If OAuth scopes change, recreate `token.json`.
