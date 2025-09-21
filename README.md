### cli-agent

An interactive CLI AI agent built with LangChain, LangGraph, and Ink. It streams model responses, invokes structured tools to read/modify files in a target project, and persists conversational history for iterative workflows.

<img width="1728" height="1117" alt="Screenshot 2025-09-07 at 9 57 00 PM" src="https://github.com/user-attachments/assets/6d26265a-33f6-450a-a61c-9aa1d03da6b7" />

### Build & Run

- Requirements: Go 1.25+; macOS/Linux/WSL2
- Env: export `OPENAI_API_KEY` with your key

Build:

```bash
make local-build    # installs 'cli-agent'
# or
go build -o cli-agent .
```

Run:

```bash
go run .
# or, after build
./cli-agent
```

Dev loop:

```bash
make dev  # sets GOENV=dev, builds, runs
```

### Testing & Formatting

```bash
go test ./...
go vet ./...
gofmt -s -w .
go build
```

### Optional Python Server

If you want to use the FastAPI server with LangChain tools:

```bash
cd server
pip install -r requirements.txt
# Run with reload in dev:
ENV=dev python main.py
# Or via uvicorn:
ENV=local uvicorn agent:app --host 127.0.0.1 --port 8080
```

The server reads `OPENAI_API_KEY` from env or a `.env` in `server/`.

### Roadmap / TODOs

- [x] Render without jankyness
- [x] Text input
- [x] Text input with multi line support
- [ ] Todo tool for step by step agent mode
- [ ] Auto compact the context when reaching context limit
- [ ] Web search tool
- [x] Grep tool
- [x] Create new files and folders tool
- [x] Remove files and folders tool
- [x] Append or patch files tool
- [x] Select files of the working dir using '@'
- [ ] LSP integration for linting

### License

MIT
