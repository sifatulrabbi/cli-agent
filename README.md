### cli-agent

An interactive CLI AI agent built with LangChain, LangGraph, and Ink. It streams model responses, invokes structured tools to read/modify files in a target project, and persists conversational history for iterative workflows.

### Highlights

- **Streaming UI**: Smooth, incremental assistant output with a spinner status line
- **Tool calling**: File listing, reading, inserting, patching, and removing via safe, structured tools
- **Persistent history**: Conversation stored on disk for continuity between runs
- **Embeddable app**: Clean React (Ink) components for header, messages, input, and status
- **Model flexibility**: Works with OpenAI and OpenRouter models

### Requirements

**bun.js** _Or_ **Node.js**: >= 20

### Installation

```bash
bun install
# or
npm install
```

### Environment

Create a `.env` file in the project root with the keys you plan to use.

```bash
# For OpenAI models (e.g., gpt-4.1, gpt-5, o4-mini)
OPENAI_API_KEY=sk-...

# For OpenRouter models (e.g., gpt-oss-120b)
OPENROUTER_API_KEY=or-...
```

### Running

- **Dev (bun, no build):**

```bash
bun src/index.tsx
```

Notes:

- The default app entry (`src/index.tsx`) renders the Ink UI and points to `testBench/local-testing.json` for the on-disk history file.
- The default model is `gptOss120b`. You can change it in `src/index.tsx` or swap to any key from `models` in `src/agent.ts`.

### Using the CLI

- Type a prompt and press Enter.
- End input with a trailing backslash `\` to insert a newline before submitting on the next Enter.
- Commands:
  - `/clear`: clear history on disk and in the UI
  - `/exit`: quit the app

### Models

Available model presets live in `src/agent.ts` under `models`. Examples include:

- `gpt41mini`, `gpt41`, `gpt5`, `gpt5High`, `gpt5MiniHigh` (via openai)
- `gptOss120b` (via OpenRouter)
- `o4MiniHigh`

Update the `model` prop where `<App />` is rendered in `src/index.tsx`.

### Tools (Runtime Capabilities)

Defined in `src/toolsSet1.ts` and wired into the app via `src/index.tsx`:

- **list_project_files_and_dirs_tool**: Recursively list files/dirs of the active project
- **read_files_tool**: Read multiple files with stable line-number formatting
- **create_entity_tool**: Create a directory or file (content provided for files)
- **remove_entity_tool**: Remove a directory (recursive) or file
- **insert_into_text_file_tool**: Insert content after a given line number, preserving original EOL
- **patch_text_file_tool**: Replace existing line ranges only, preserving original EOL

A second placeholder set (`src/toolsSet2.ts`) sketches future research/search tools.

### Architecture Overview

- **UI**: Ink components in `src/cli/*` (`HeaderBar`, `MessageView`, `Input`, `StatusIndicator`)
- **Agent**: `src/agent.ts` builds a LangGraph `StateGraph` with two nodes:
  - `llm` node streams assistant output and tool calls
  - `tools` node executes structured tools and returns `ToolMessage`s
- **History**: JSON-serialized messages saved to disk; loaded on boot and synced after each step
- **Config**: TypeScript project paths via `tsconfig.json` (`@/*` -> `src/*`)

### Roadmap / TODOs

- [ ] Proper text input
- [ ] Render without jankyness
- [ ] Todo tool for step by step agent mode
- [ ] Auto compact the context when reaching context limit
- [ ] Web search tool
- [ ] Grep tool
- [ ] Select files of the working dir
- [ ] LSP integration for linting

### License

MIT
