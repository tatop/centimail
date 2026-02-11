# Gmail + OpenRouter

Classify unread Gmail messages with OpenRouter and return structured JSON summaries. Includes a CLI and a small FastAPI + React UI for quick triage.

> Developed with assistance from OpenAI Codex!.

## Features

- Fetch unread Gmail messages (readonly scope)
- Classify into a single label from a controlled list
- Generate 1-2 sentence summaries
- Enforce structured JSON output via OpenRouter `response_format` JSON Schema
- CLI output (pretty or compact JSON)
- FastAPI server + React frontend for browsing results

## Project layout

- `backend/main.py` - CLI entrypoint
- `backend/server.py` - FastAPI server
- `backend/classifier.py` - Gmail fetch + OpenRouter orchestration
- `backend/gmail.py` - Gmail API auth + retrieval
- `backend/openrouter.py` - stdlib-only OpenRouter client
- `backend/config.py` - defaults + `.env` loading
- `frontend/` - Vite + React UI

## Requirements

- Python 3.13+
- `uv`
- A Gmail OAuth client (`credentials.json` at repo root)
- OpenRouter API access

## Setup

1) Install backend deps:

```bash
uv sync
```

2) Place `credentials.json` at repo root (Google OAuth client).

3) Create `.env` in repo root:

```env
MODEL=your-openrouter-model
OPENROUTER_API_KEY=your-key
OPENROUTER_API_URL=https://openrouter.ai/api/v1/chat/completions
```

On first run, the Gmail OAuth flow will create `token.json` locally.

## CLI usage

Run the classifier:

```bash
uv run python -m backend.main --pretty
```

Or via the script entrypoint:

```bash
uv run gmail-cli --pretty
```

Useful flags:

- `--max-results 5`
- `--label-ids INBOX,UNREAD`
- `--labels azione_richiesta,informazione,importante,non_importante`
- `--model <openrouter-model>`
- `--max-tokens 800`
- `--no-structured-output` (fallback to prompt-only JSON)
- `--include-reasoning`
- `--timeout 120`

## API server

Start the backend:

```bash
uv run python -m backend.server
```

Endpoints:

- `GET /health`
- `POST /api/classify/unread`
- `POST /api/classify/emails`

Example request:

```bash
curl -X POST http://localhost:8000/api/classify/unread \
  -H 'Content-Type: application/json' \
  -d '{"max_results": 5, "use_structured_output": true}'
```

Custom emails:

```bash
curl -X POST http://localhost:8000/api/classify/emails \
  -H 'Content-Type: application/json' \
  -d '{"emails": [{"id": "1", "subject": "Invoice", "sender": "Acme", "body": "..."}]}'
```

Response shape:

```json
{
  "items": [
    {
      "id": "...",
      "label": "azione_richiesta",
      "summary": "...",
      "subject": "...",
      "sender": "..."
    }
  ]
}
```

## Frontend

Start the UI (defaults to `http://localhost:5173`):

```bash
cd frontend
npm install
npm run dev
```

The frontend reads `VITE_API_URL` (default: `http://localhost:8000`).

## Notes

- Default labels live in `backend/config.py`.
- Gmail scope is readonly; if you change scopes, delete `token.json` and re-auth.
- Keep `credentials.json`, `token.json`, and `.env` uncommitted.

## Development helper

This repo includes `dev.sh` to start backend + frontend together (uses `bun` for the frontend). Ensure `bun` is installed before running it.

```bash
./dev.sh
```
