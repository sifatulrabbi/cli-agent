import {
  START,
  END,
  MessagesAnnotation,
  StateGraph,
  Annotation,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import {
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { Tools } from "../tools";
import z from "zod";

export type AgentTodo = {
  index: number;
  title: string;
  detail: string;
  done: boolean;
};

const PlanningAgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  todoList: Annotation<AgentTodo[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
});

export type PlanningAgentState = typeof PlanningAgentStateAnnotation.State;

const todosSchema = z.object({
  todos: z.array(
    z.object({
      index: z
        .number()
        .describe("Sequential index starting from 0 for each todo item"),
      title: z
        .string()
        .describe("Short, actionable title for the todo (max 50 chars)"),
      detail: z
        .string()
        .describe(
          "Detailed description of what needs to be done to complete this todo",
        ),
    }),
  ),
});

const LLM_SYSTEM_PROMPT = `
You are GPT-5, an elite software planning partner helping a developer deliver high-quality code updates.

Workflow:
1. Study the user's latest request and the existing conversation.
2. Use the bash tool sparingly to read repository context you truly need.
   - Prefer fast, read-only commands like 'ls', 'rg', 'sed -n', or 'cat'.
   - Never modify files or run commands that change state.
   - Stop once you have just enough detail to design the plan.
3. When you understand the work, stop calling tools and respond with a concise readiness summary (no code blocks, no todo list).

Communication style:
- Think aloud internally but share only the key insights the developer needs.
- Ask for missing information only when it blocks planning.
- Acknowledge constraints, edge cases, and validation needs you infer from the repo.

Output while gathering context:
- If you still need information, call the bash tool with the exact command to run.
- When ready to plan, reply with 'READY_TO_PLAN:' followed by a single sentence describing the approach. Do not include todos yet.
`.trim();

const PLANNING_SYSTEM_PROMPT = `
You are GPT-5, producing an execution plan for a software engineer.
Using the prior dialogue and tool outputs, create a JSON object that matches the required schema.

Planning requirements:
- Break the work into sequential todos covering implementation, validation, and follow-up steps.
- Each todo must stand alone, reference specific files or commands when relevant, and stay under 50 characters for the title.
- Ensure the plan accounts for tests or verification the engineer should run.

Respond with JSON only, no surrounding prose.
`.trim();

function extractMessageText(message: AIMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => {
        if (typeof block === "string") return block;
        if ("text" in block && block.text) return block.text;
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

async function llmNode(state: PlanningAgentState) {
  const llm = new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5",
    useResponsesApi: true,
    reasoning: {
      effort: "medium",
      summary: "detailed",
    },
  });
  const llmWithTools = llm.bindTools([Tools.bashTool]);

  const history = [new SystemMessage(LLM_SYSTEM_PROMPT), ...state.messages];
  const response = await llmWithTools.invoke(history);

  const updates: Partial<PlanningAgentState> = {
    messages: [response],
  };

  const toolCalls = response.tool_calls ?? [];
  if (toolCalls.length > 0) {
    return updates;
  }

  const planningLLM =
    llm.withStructuredOutput<z.infer<typeof todosSchema>>(todosSchema);

  const planningMessages = [
    new SystemMessage(PLANNING_SYSTEM_PROMPT),
    ...state.messages,
    response,
  ];

  try {
    const plan = await planningLLM.invoke(planningMessages);
    updates.todoList = plan.todos.map((todo, index) => ({
      ...todo,
      index,
      done: false,
    }));
  } catch (error) {
    const fallbackSummary = extractMessageText(response);
    updates.todoList = [
      {
        index: 0,
        title: "Review context",
        detail:
          "Planning agent could not produce structured todos. Review conversation and rerun planning. Summary: " +
          fallbackSummary,
        done: false,
      },
    ];
  }

  return updates;
}

async function toolsNode(state: PlanningAgentState) {
  const toolMessages: ToolMessage[] = [];
  const toolCalls = (state.messages.at(-1)! as AIMessage).tool_calls!;

  for (const tc of toolCalls) {
    if (tc.name === "bash") {
      const result = await Tools.bashTool.invoke(tc);
      if (typeof result === "string") {
        toolMessages.push(
          new ToolMessage({
            name: tc.name,
            content: result,
            tool_call_id: tc.id!,
          }),
        );
      } else {
        toolMessages.push(result);
      }
    }
  }

  return {
    messages: toolMessages,
  };
}

export const PlanningAgent = new StateGraph(PlanningAgentStateAnnotation)
  .addNode("llm", llmNode)
  .addNode("tools", toolsNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", (state) => {
    if (state.todoList.length > 0) {
      return END;
    }

    const lastMsg = state.messages.at(-1) as AIMessage | undefined;
    const hasToolCall = lastMsg?.tool_calls && lastMsg.tool_calls.length > 0;

    if (hasToolCall) {
      return "tools";
    }
    return END;
  })
  .addEdge("tools", "llm")
  .compile({ name: "PlanningAgent" });
