import { ChatOpenAI } from "@langchain/openai";
import {
  SystemMessage,
  HumanMessage,
  BaseMessage,
  ToolMessage,
  AIMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { StateGraph, START, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "langchain/tools";
import chalk from "chalk";
import fs from "fs";

export type DebuggerAgentOptions = {
  historyPath: string;
  systemInstruction?: string;
  trimReasoning?: boolean;
};

function defaultSystemInstruction(): string {
  return `
You are a coding assistant that builds runnable applications end-to-end using the provided filesystem tools. You must deliver:
1) a working codebase created entirely via tools
2) a README.md at the project root with complete step-by-step instructions to run the app.

General rules
- Always use the available tools to list, create, modify, and delete files. Do not simulate file changes in chat.
- Use full, absolute paths exactly as returned by the file listing tool.
- Create directories before writing files inside them.
- Preserve existing indentation and EOL style when editing files. Do not reformat unrelated lines.
- When editing existing files you previously created, compute accurate line numbers from your latest known content.
- Prefer writing complete files in one go; only patch/insert when necessary.
- After each tool call, read its result and adapt accordingly.
- Be explicit and deterministic. Avoid ambiguous steps or partial instructions.
- Inform the user about what you just accomplished and what you are about to do next, especially during tool calls. However, do not stop for getting user's approval or feedback.

Tools available (from @toolsSet1.ts)
- list_project_files_and_dirs_tool()
  - Purpose: Discover all files/dirs. It returns a <project-entries> block where each entry is a full path.
  - Always call this before any path-sensitive operation and to confirm results after changes.

- create_entity_tool({ entityPath, entityType, entityName, content })
  - entityType: "dir" or "file".
  - For safety, pass the same full path for both entityPath and entityName (use the exact full path format from the listing tool).
  - For "dir", provide content as an empty string. For "file", provide the full file content.
  - Used to scaffold dirs, create files (e.g., package.json, source files), and write README.md.

- remove_entity_tool({ entityPath })
  - Removes a file or directory (recursive). Use full path from the listing tool.

- patch_text_file_tool({ filePath, patches })
  - Replaces existing line ranges using 1-based inclusive startLine/endLine.
  - Use only when you precisely know the existing lines.

- insert_into_text_file_tool({ filePath, inserts })
  - Inserts content using insertAfter (0-based index; insertAfter=0 inserts at top; 3 inserts after line 3).
  - Use for appends or targeted insertions.

Workflow
1) Clarify requirements
   - Confirm app type, stack, entry points, features, and scripts the user expects.

2) Plan the build
   - Produce a short actionable plan: directory structure, key files, dependencies, and run scripts.

3) Scaffold the project
   - Create directories and files with create_entity_tool.
   - Choose one package manager (default to npm unless the user requests otherwise) and define scripts in package.json.

4) Implement features
   - Write complete files where possible. For updates, use patch/insert with precise line numbers.

5) Verify structure
   - Call list_project_files_and_dirs_tool to ensure expected files/dirs exist.

6) Document thoroughly
   - Create README.md at the project root with:
     - Overview
     - Prerequisites
     - Setup (install dependencies)
     - Environment variables (if any)
     - Run scripts (dev and production)
     - Build (if applicable)
     - Test (if applicable)
     - Project structure
     - Common tasks and commands
   - Include exact commands (e.g., npm install, npm run dev, npm run build, npm start).
   - Ensure instructions are step-by-step and copy-paste ready.

7) Final check
   - Re-list files to confirm README.md and all key files exist.
   - Summarize what was built and how to run it.

Conventions
- Paths: always use the exact absolute paths from the listing tool.
- Indentation/EOL: preserve whatever is in the file; do not convert tabs/spaces or newline style.
- Safety: avoid destructive changes unless requested; prefer additive changes.
- Output: keep chat responses concise and operational; rely on tools for actual file changes.
- Informing the user: inform the user about what you just accomplished and what you are about to do next, especially during tool calls. However, do not stop for getting user's approval or feedback.

Your objective is to produce a runnable app and a crystal-clear README.md that enables the user to set up and run the app without additional help.
`.trim();
}

function callModelFactory(
  llm: ChatOpenAI,
  sysMsg: SystemMessage,
  tools: DynamicStructuredTool[],
  trimReasoning: boolean = false,
) {
  function extractDisplayParts(message: AIMessage | AIMessageChunk) {
    const toolNamesSet = new Set<string>();
    let thinking = "";
    let reply = "";

    const toolCalls = message?.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (tc?.name) toolNamesSet.add(tc.name);
      }
    }

    const content = message?.content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === "text") {
          reply += part?.text ?? "";
        }
      }
    } else if (typeof content === "string") {
      reply = content;
    } else if (
      content &&
      typeof content === "object" &&
      typeof (content as any).text === "string"
    ) {
      reply = (content as any).text;
    }

    if (message.additional_kwargs?.reasoning) {
      const reasoning: any = message.additional_kwargs.reasoning;
      if (reasoning.summary) {
        for (const part of reasoning.summary) {
          if (part?.type === "summary_text") {
            thinking += part?.text ?? "";
          }
        }
      }
    }

    return {
      toolNames: Array.from(toolNamesSet),
      thinking: thinking.trim(),
      reply: reply.trim(),
    };
  }

  return async function (state: typeof MessagesAnnotation.State) {
    const messages = [sysMsg, ...state.messages];
    console.log(chalk.blue("Invoking the LLM..."));

    const response = await llm.bindTools(tools).invoke(
      messages.map((msg) => {
        if (trimReasoning && msg.getType() === "ai") {
          const aiMsg = msg as AIMessage;
          if (aiMsg.additional_kwargs?.reasoning) {
            delete aiMsg.additional_kwargs.reasoning;
          }
        }
        return msg;
      }),
    );

    // Pretty-print the response parts to the terminal
    const { toolNames, thinking, reply } = extractDisplayParts(response);
    if (thinking) {
      console.log(chalk.gray(thinking));
    }
    if (toolNames.length > 0) {
      console.log(chalk.yellow(`Tool calls: ${toolNames.join(", ")}`));
    }
    if (reply) {
      console.log(reply);
    }
    return { messages: [response] };
  };
}

function syncHistory(historyPath: string, messages: BaseMessage[]) {
  fs.writeFileSync(
    historyPath,
    JSON.stringify(
      messages.map((msg) => msg.toJSON()),
      null,
      2,
    ),
  );
}

export async function invokeDebuggerAgent(
  llm: ChatOpenAI,
  tools: DynamicStructuredTool[],
  options: DebuggerAgentOptions,
) {
  const system = new SystemMessage({
    content: (options.systemInstruction ?? defaultSystemInstruction()).trim(),
  });
  const toolNode = new ToolNode(tools);
  let history: BaseMessage[] = [];

  if (fs.existsSync(options.historyPath)) {
    try {
      const raw = fs.readFileSync(options.historyPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        history = parsed.map((entry: any) => {
          const typeId: string | undefined = entry?.id?.[2];
          const kwargs = entry?.kwargs ?? {};
          switch (typeId) {
            case "HumanMessage":
              return new HumanMessage(kwargs);
            case "AIMessage":
              return new AIMessage(kwargs);
            case "ToolMessage":
              return new ToolMessage(kwargs);
            case "SystemMessage":
              return new SystemMessage(kwargs);
            default:
              throw new Error(
                `Unsupported message type in history: ${String(typeId)}`,
              );
          }
        });
      }
    } catch (err) {
      console.warn(
        `Failed to load prior history from ${options.historyPath}. Proceeding with empty history.`,
        err,
      );
      history = [];
    }
  }

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("llm", callModelFactory(llm, system, tools, options.trimReasoning))
    .addNode("tools", toolNode)
    .addConditionalEdges(START, (state) => {
      if (state.messages.at(-1)?.getType() === "ai") {
        const lastMsg = state.messages.at(-1) as AIMessage;
        if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
          console.log("Found remaining tool calls");
          return "tools";
        }
      }
      return "llm";
    })
    .addConditionalEdges("llm", (state) => {
      syncHistory(options.historyPath, state.messages);
      return toolsCondition(state);
    })
    .addEdge("tools", "llm")
    .compile();

  const result = await graph.invoke(
    { messages: history },
    { recursionLimit: 10 ** 10 },
  );

  syncHistory(options.historyPath, result.messages);

  return result;
}
