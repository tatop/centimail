# Repository Guidelines
Pietro owns this. Start: say hi + 1 motivating line. Work style: telegraph; noun-phrases ok; drop grammar; min tokens.

## Project Structure & Module Organization
- `backend/main.py` is the CLI entrypoint (arg parsing, JSON output).
- `backend/classifier.py` orchestrates Gmail fetch + OpenRouter classify/summarize.
- `backend/gmail.py` wraps Gmail API auth + unread message retrieval.
- `backend/openrouter.py` is the stdlib-only OpenRouter client + JSON parsing helpers.
- `backend/config.py` loads `.env` settings and defines defaults (labels, scopes, limits).
- `frontend/` is the Vite + React app (`frontend/src/main.tsx`, `frontend/src/App.tsx`).
- `pyproject.toml` and `uv.lock` define Python dependencies and lock versions.
- `frontend/package.json` and `frontend/bun.lock` define frontend dependencies.
- OAuth files (`credentials.json`, `token.json`) live at the repo root; keep them local and uncommitted.
- `.env` lives at the repo root for OpenRouter config; keep it local and uncommitted.

## Build, Test, and Development Commands
- `uv sync` installs backend dependencies from `pyproject.toml`/`uv.lock`.
- `uv run python backend/main.py --pretty` runs the classifier CLI.
- `uv run gmail-cli --pretty` runs the script entrypoint (keep `pyproject.toml` and entrypoint module aligned).
- Frontend dev: `cd frontend && npm install` then `npm run dev` (or equivalent package manager).

## Coding Style & Naming Conventions
- Use Python 3.13+ (see `pyproject.toml`).
- Indentation: 4 spaces; keep functions small and focused.
- Naming: snake_case for functions/variables, ALL_CAPS for constants (e.g., `SCOPES`).

## Commit & Pull Request Guidelines
- Commit messages are short, sentence case, and descriptive (e.g., “Added Gmail access”).
- PRs should include a brief summary, the reason for the change, and any setup steps or required environment variables.

## Security & Configuration Tips
- Do not commit `credentials.json`, `token.json`, or `.env`.
- Store secrets in environment variables (e.g., `OPENROUTER_API_KEY`).
- If you change OAuth scopes in `backend/gmail.py`, delete `token.json` and re-authenticate.
