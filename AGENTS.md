# Repository Guidelines

## Project Structure & Module Organization
- `packages/server` (Python/FastAPI): API, LangGraph agent, and `db/` (SQLite via SQLAlchemy).
- `packages/tui` (Go): Bubble Tea TUI; `Makefile` provides a dev entry.
- `ts-mvp` (TypeScript/Ink): Interactive CLI, tools, and minimal test scripts in `src/__tests__/`.
- `testBench/`: Sample projects/fixtures for agent experiments; not production code.
- `tmp/`: Local logs/scratch. Root `.env` is read by the TS CLI.

## Build, Test, and Development Commands
- TypeScript CLI (Bun 1.x, Node >= 20)
  - `cd ts-mvp`
  - Dev: `bun run dev` (runs `src/index.tsx`)
  - Build: `bun run build` (emits to `dist/`)
  - Run a test script: `bun ts-mvp/src/__tests__/tools.test.ts`
  - Example CLI: `bun ts-mvp/src/index.tsx -n demo -m gpt41mini`
- Go TUI
  - `cd packages/tui && make dev` (builds, installs, runs `tea-play`).
- Python API (uvicorn, DB_PATH required)
  - `cd packages/server`
  - `export DB_PATH=./cli-agent.db` (or set in `.env`)
  - Start: `uvicorn packages.server.server:app --reload`

## Coding Style & Naming Conventions
- TypeScript: 2‑space indent, ESM, strict TS; file names kebab‑case; React components PascalCase; run `bun run build` cleanly.
- Go: follow `gofmt`; keep packages small and cohesive.
- Python: PEP 8 (4‑space indent), type hints where practical; async SQLAlchemy patterns as in `db/`.

## Testing Guidelines
- TS: place ad‑hoc tests in `ts-mvp/src/__tests__/` as `*.test.ts`; execute with Bun (see above).
- Go/Python: no framework set up yet—prefer small, self‑contained tests; if adding, mirror standard names (`*_test.go`, `tests/test_*.py`).

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` (e.g., `feat(server): add SSE chat endpoint`).
- PRs: include clear description, linked issues, run/usage notes (CLI flags, endpoints), and screenshots for UI when relevant.

## Security & Configuration Tips
- Do not commit secrets. Populate `.env` with `OPENAI_API_KEY`, `DEFAULT_MODEL`, `THREAD_ID`, and `DB_PATH` (server).
- Avoid absolute paths (see `ts-mvp/src/configs.ts`); prefer repo‑relative paths.
- Validate env is loaded before invoking models or DB.
