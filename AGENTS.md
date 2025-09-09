# Repository Guidelines

## Project Structure & Module Organization

- Go app entry: `main.go`, Cobra CLI: `cmd/`.
- Core packages: `internals/`
  - `agent/` (tooling + server calls), `tui/` (Ink-like Bubble Tea UI), `configs/`, `db/`, `utils/`.
- Experiments: `ts-mvp/` (TypeScript Ink UI + LangGraph), `packages/server/` (Python FastAPI agent server), `testBench/` (sample projects/fixtures).
- Dev workspace and logs: `tmp/` (auto-created in dev mode).

## Build, Test, and Development Commands

- Go local build: `make local-build` — builds and installs `cli-agent`.
- Go dev run: `make dev` — builds, installs, sets `GOENV=dev`, then runs `cli-agent`.
- Run directly: `go run .`
- Tests (Go): `go test ./...`
- Python server (optional, used by `internals/agent`):
  - `cd packages/server && pip install -r requirements.txt`
  - `ENV=local uvicorn agent:app --host 127.0.0.1 --port 8080` (or `python main.py`).
- TS experiments: `cd ts-mvp && bun run dev` or `bun run build`.

## Coding Style & Naming Conventions

- Go formatting: run `gofmt -s -w .`; vet with `go vet ./...`.
- Indentation: Go defaults (tabs via `gofmt`).
- Packages: short, lowercase names (e.g., `tui`, `agent`).
- Tests: files end with `_test.go`; exported test funcs `TestXxx`.
- Keep public APIs small; prefer internal helpers in `internals/*`.

## Testing Guidelines

- No need to perform `go test`.
- For testing if the TUI compiles or not use the `go build` command.

## Commit & Pull Request Guidelines

- Commits: imperative mood, scoped and small (e.g., `feat(agent): add grep tool`).
- Reference issues in the body (`Fixes #123`).
- PRs: include summary, motivation, before/after notes, and screenshots for TUI changes; list manual test steps.

## Security & Configuration

- Secrets via env: requires `OPENAI_API_KEY`.
- Dev mode: set `GOENV=dev` and a local `.env`; logs at `./tmp/logs/debug.log`.
- Do not commit secrets, `tmp/`, or large artifacts.

## Agent-Specific Tips

- Tooling assumes a writable working directory; in dev it is `./tmp`.
- For server-backed flows, ensure the FastAPI server is running on `127.0.0.1:8080` before starting the CLI.
