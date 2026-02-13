# Repository Guidelines
Pietro owns this. Start: say hi + 1 motivating line. Work style: telegraph; noun-phrases ok; drop grammar; min tokens.

## Project Structure & Module Organization
- Root is the full-stack Next.js app (UI + API routes).
- `app/` contains routes/pages (`/api/classify/*`, `/health`, `/`).
- `lib/backend/` contains server-side Gmail/OpenRouter logic used by API routes.
- `package.json` and `bun.lock` define active runtime dependencies.
- OAuth files (`credentials.json`, `token.json`) live at the repo root; keep them local and uncommitted.
- `.env` lives at the repo root for OpenRouter config; keep it local and uncommitted.

## Build, Test, and Development Commands
- `bun install` installs app dependencies.
- `bun run dev` runs local development server.
- `bun run build` builds production bundle.

## Coding Style & Naming Conventions
- TypeScript/React follows project eslint + Next.js defaults.
- Keep server logic in `lib/backend/` and route handlers in `app/api/`.

## Commit & Pull Request Guidelines
- Commit messages are short, sentence case, and descriptive (e.g., “Added Gmail access”).
- PRs should include a brief summary, the reason for the change, and any setup steps or required environment variables.

## Security & Configuration Tips
- Do not commit `credentials.json`, `token.json`, or `.env`.
- Store secrets in environment variables (e.g., `OPENROUTER_API_KEY`).
- If you change OAuth scopes, delete `token.json` and re-authenticate.
