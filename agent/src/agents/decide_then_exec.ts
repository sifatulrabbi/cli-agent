import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { type Session } from "../session";
import { type DynamicStructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync } from "fs";
import { bashTool } from "../tools/bash_tool.ts";
import { noteTool } from "../tools/note_tool.ts";
import { codingAgentSysPrompt, codingWorkerSysPrompt } from "../prompts/index";
import { concat } from "@langchain/core/utils/stream";
import { v4 } from "uuid";

const TaskSchema = z.object({
  id: z.number().describe("Incremental ID for the task, starts from 1."),
  description: z.string().describe("Detailed description of the task."),
});

const StepByStepArgsSchema = z.object({
  tasks: z
    .array(TaskSchema)
    .describe("Step by step tasks to handle the request."),
});

const defaultConfig = { recursionLimit: 10 ** 10 };
const openRouterBaseUrl = "https://openrouter.ai/api/v1";

const qwenCode30B = new ChatOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "qwen/qwen3-coder-30b-a3b-instruct", //
  configuration: { baseURL: openRouterBaseUrl },
});
const haiku45 = new ChatOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "anthropic/claude-haiku-4.5",
  reasoning: { effort: "medium", summary: "detailed" },
  modelKwargs: {
    thinking: { type: "enabled", budget_tokens: 2048 },
  },
  configuration: { baseURL: openRouterBaseUrl },
});
const gpt5Mini = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-5-mini",
  reasoning: { effort: "medium", summary: "detailed" },
});
const kimiK2 = new ChatOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "moonshotai/kimi-k2-0905",
  reasoning: { effort: "high", summary: "detailed" },
  configuration: { baseURL: openRouterBaseUrl },
});

function getNotes(): string {
  const content = readFileSync(
    "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md",
    "utf-8",
  );
  return content;
}

async function basicAgentLoop(
  {
    session,
    model,
    tools,
    systemPromptBuilder,
  }: {
    systemPromptBuilder: () => string;
    session: Session;
    model: ChatOpenAI;
    tools: Record<string, DynamicStructuredTool>;
  },
  streamCb: (msg: BaseMessage) => Promise<void>,
) {
  const modelWithTools = model.bindTools(Object.values(tools));

  while (true) {
    const stream = await modelWithTools.stream(
      [new SystemMessage(systemPromptBuilder()), ...session.getHistory()],
      defaultConfig,
    );

    let aiResponse: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      if (!aiResponse) {
        aiResponse = chunk;
      } else {
        aiResponse = concat(aiResponse, chunk);
      }
      await streamCb(aiResponse);
    }

    if (!aiResponse) {
      break;
    }

    await session.append(aiResponse);
    await streamCb(aiResponse);

    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
      for (const tc of aiResponse.tool_calls) {
        console.log(`[TOOL: ${tc.name}]`, tc.args);
        const toolFunc = tools[tc.name];
        let toolResult: string;

        if (!toolFunc) {
          toolResult = "Invalid tool name! Please use a valid tool.";
          console.log("xxx Invalid tool call! xxx");
        } else {
          toolResult = await toolFunc.invoke(tc.args);
        }

        await session.append(
          new ToolMessage({
            content: toolResult,
            name: tc.name,
            tool_call_id: tc.id!,
          }),
        );
        await streamCb(aiResponse);
      }
    } else {
      break;
    }
  }
}

const stepByStepExecutionTool = (
  streamCb: (msg: BaseMessage) => Promise<void>,
) =>
  tool(
    async ({ tasks }: any) => {
      const availableToolsMap: Record<string, DynamicStructuredTool> = {
        bash: bashTool,
        note: noteTool,
      };
      const llmWithTools = kimiK2.bindTools(Object.values(availableToolsMap));

      let finalResponse = "";

      for (const task of tasks) {
        console.log(`\n--- Working on task [${task.id}] ---`);
        const history: BaseMessage[] = [
          new HumanMessage(`Handle this task:\n\n${task.description}`),
        ];

        while (true) {
          const stream = await llmWithTools.stream(
            [new SystemMessage(codingWorkerSysPrompt(getNotes())), ...history],
            defaultConfig,
          );

          let aiResponse: AIMessageChunk | null = null;

          for await (const chunk of stream) {
            if (!aiResponse) {
              aiResponse = chunk;
            } else {
              aiResponse = concat(aiResponse, chunk);
            }

            // Display thinking/reasoning content if available
            if ((chunk as any).reasoning_content) {
              process.stdout.write(
                `\n[THINKING] ${(chunk as any).reasoning_content}\n`,
              );
            }

            process.stdout.write((chunk.content || "").toString());
          }
          console.log();

          if (!aiResponse) break;

          history.push(aiResponse);

          if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
            for (const tc of aiResponse.tool_calls) {
              console.log(`[TOOL: ${tc.name}]`, tc.args);
              const toolFunc = availableToolsMap[tc.name];
              let toolResult: string;

              if (!toolFunc) {
                toolResult = "Invalid tool name! Please use a valid tool.";
                console.log("xxx Invalid tool call! xxx");
              } else {
                toolResult = await toolFunc.invoke(tc.args);
              }

              history.push(
                new ToolMessage({
                  content: toolResult,
                  name: tc.name,
                  tool_call_id: tc.id!,
                }),
              );
            }
          } else {
            break;
          }
        }

        finalResponse += `<task id="${task.id}">
<description>
${task.description}
</description>
<result>
${history[history.length - 1]?.content}
</result>
</task>
`;
      }

      return finalResponse;
    },
    {
      name: "step_by_step_execution",
      description:
        "Invoke this tool to handle complex or multi-stage tasks that require deep reasoning, " +
        "precise planning, or many modifications — such as feature implementation, debugging, " +
        "bug fixing, optimization, or multi-file refactors. " +
        "When used, this tool will spawn a specialized version of the agent to execute the task " +
        "step by step with full autonomy and all tool access.",
      schema: StepByStepArgsSchema,
    },
  );

export async function runDecideAndExecAgent(
  { userInput, session }: { userInput: string; session: Session },
  streamCb: (msg: BaseMessage) => Promise<void>,
) {
  const availableToolsMap: Record<string, DynamicStructuredTool> = {
    bash: bashTool,
    note: noteTool,
    step_by_step_execution: stepByStepExecutionTool(streamCb),
  };
  const llmWithTools = gpt5Mini.bindTools(Object.values(availableToolsMap));

  const userMsg = new HumanMessage({ id: v4(), content: userInput });
  await session.append(userMsg);
  await streamCb(userMsg);

  let done = false;
  while (!done) {
    const stream = await llmWithTools.stream(
      [
        new SystemMessage(codingAgentSysPrompt(getNotes())),
        ...session.getHistory(),
      ],
      defaultConfig,
    );

    let aiResponse: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      if (!aiResponse) {
        aiResponse = chunk;
      } else {
        aiResponse = concat(aiResponse, chunk);
      }
      await streamCb(aiResponse);

      // chunk.contentBlocks.forEach((b) => {
      //   if (typeof b.reasoning === "string" && b.reasoning) {
      //   }
      //   if (typeof b.text === "string" && b.text) {
      //   }
      // });
    }

    if (!aiResponse) {
      done = true;
      break;
    }

    await session.append(aiResponse);
    await streamCb(aiResponse);

    if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
      for (const tc of aiResponse.tool_calls) {
        console.log(`[TOOL: ${tc.name}]`, tc.args);
        const toolFunc = availableToolsMap[tc.name];
        let toolResult: string;

        if (!toolFunc) {
          toolResult = "Invalid tool name! Please use a valid tool.";
          console.log("xxx Invalid tool call! xxx");
        } else {
          toolResult = await toolFunc.invoke(tc.args);
        }

        await session.append(
          new ToolMessage({
            content: toolResult,
            name: tc.name,
            tool_call_id: tc.id!,
          }),
        );
        await streamCb(aiResponse);
      }
    } else {
      done = true;
      break;
    }
  }
}
