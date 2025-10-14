import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  BaseMessage,
  AIMessageChunk,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileSync } from "fs";
import { bashTool } from "../tools/bash_tool.ts";
import { noteTool } from "../tools/note_tool.ts";
import { codingAgentSysPrompt, codingWorkerSysPrompt } from "../prompts.ts";
import { concat } from "@langchain/core/utils/stream";

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

function getNotes(): string {
  const content = readFileSync(
    "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md",
    "utf-8",
  );
  return content;
}

const stepByStepExecutionTool = tool(
  async ({ tasks }: any) => {
    console.log("\nHandling tasks step by step:");
    for (const t of tasks) {
      console.log(`[${t.id}]`, t.description);
    }
    console.log("-".repeat(5));

    const availableToolsMap: Record<string, any> = {
      bash: bashTool,
      note: noteTool,
    };

    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4.1-mini",
      // modelKwargs: { reasoning_effort: "medium" },
    });

    const llmWithTools = llm.bindTools([bashTool, noteTool]);

    let finalResponse = "";

    for (const task of tasks) {
      console.log(`\n--- Working on task [${task.id}] ---`);
      const history: BaseMessage[] = [
        new HumanMessage(`Handle this task:\n\n${task.description}`),
      ];

      while (true) {
        const stream = await llmWithTools.stream([
          new SystemMessage(codingWorkerSysPrompt(getNotes())),
          ...history,
        ]);

        let aiResponse: AIMessageChunk | null = null;

        for await (const chunk of stream) {
          if (!aiResponse) {
            aiResponse = chunk;
          } else {
            aiResponse = concat(aiResponse, chunk);
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

export async function runDecideThenExecAgent(
  userMsg: string,
  memory: BaseMessage[],
): Promise<BaseMessage[]> {
  const availableToolsMap: Record<string, any> = {
    bash: bashTool,
    note: noteTool,
    step_by_step_execution: stepByStepExecutionTool,
  };

  const llm = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5-mini",
    modelKwargs: { reasoning_effort: "low" },
  });

  const llmWithTools = llm.bindTools([
    bashTool,
    noteTool,
    stepByStepExecutionTool,
  ]);

  const history = memory;
  history.push(new HumanMessage(userMsg));

  while (true) {
    const stream = await llmWithTools.stream([
      new SystemMessage(codingAgentSysPrompt(getNotes())),
      ...history,
    ]);

    let aiResponse: AIMessageChunk | null = null;

    for await (const chunk of stream) {
      if (!aiResponse) {
        aiResponse = chunk;
      } else {
        aiResponse = concat(aiResponse, chunk);
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

  return history;
}
