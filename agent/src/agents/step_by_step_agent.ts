import {
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  START,
  END,
  MessagesAnnotation,
  StateGraph,
  Annotation,
} from "@langchain/langgraph";
import { tool, type DynamicStructuredTool } from "@langchain/core/tools";
import { Tools } from "../tools";
import z from "zod";
import { ChatOpenAIResponses } from "@langchain/openai";
import { codingAgentWithTodosPrompt } from "../prompts/coding_agent_with_todo_prompt";
import { finalResponseCompilerPrompt } from "../prompts/final_response_compiler_prompt";

export type AgentTodo = {
  index: number;
  title: string;
  detail: string;
  done: boolean;
};

const StepByStepAgentStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  todoList: Annotation<AgentTodo[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  actions: Annotation<Record<string, any>[]>({
    reducer: (x, y) => {
      if (!x || !x.length) {
        return y ?? [];
      }

      const newList = x ?? [];

      y.forEach((newValue) => {
        const idx = x.findIndex(
          (existingValue) => existingValue.index === newValue.index,
        );
        if (idx > -1) {
          newList[idx] = newValue;
        } else {
          newList.push(newValue);
        }
      });

      return newList;
    },
    default: () => [],
  }),
});

export type StepByStepAgentState = typeof StepByStepAgentStateAnnotation.State;

const completeTodoTool = tool(
  async () => {
    return "ToDo list updated";
  },
  {
    name: "mark_todo_as_done",
    description:
      "Use this tool to mark a todo as done when you're done with the todo item.",
    schema: z.object({
      index: z
        .number()
        .describe("'index' of the todo you want to mark as done."),
    }),
  },
);

const availableTools: Record<string, DynamicStructuredTool> = {
  [Tools.bashTool.name]: Tools.bashTool,
  [Tools.noteTool.name]: Tools.noteTool,
  [completeTodoTool.name]: completeTodoTool,
};

async function llmNode(state: StepByStepAgentState) {
  const llm = new ChatOpenAIResponses({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5-mini",
    reasoning: {
      effort: "medium",
      summary: "detailed",
    },
  }).bindTools(Object.values(availableTools));
  const result = await llm.invoke([
    new SystemMessage(codingAgentWithTodosPrompt),
    ...state.messages,
  ]);

  return {
    messages: [result],
    actions: [
      {
        index: state.actions.length,
        title: "Invoking the LLM",
        displayContent: result.text,
      },
    ],
  };
}

async function toolsNode(state: StepByStepAgentState) {
  const toolMessages: ToolMessage[] = [];
  const updatedTodoList = state.todoList;
  const toolCalls = (state.messages.at(-1)! as AIMessage).tool_calls!;

  for (const tc of toolCalls) {
    const toolFn = availableTools[tc.name];

    let result = "";
    if (!toolFn) {
      result = `Invalid tool '${tc.name}' was called. Please perform a valid tool call.`;
    } else {
      result = await toolFn.invoke(tc.args);
    }

    toolMessages.push(
      new ToolMessage({
        content: result,
        id: tc.id!,
        tool_call_id: tc.id!,
        additional_kwargs: { tool_call: tc },
      }),
    );

    if (tc.name === completeTodoTool.name) {
      const idx = updatedTodoList.findIndex(
        (todo) => todo.index === tc.args.index,
      );
      if (idx > -1) {
        updatedTodoList[idx]!.done = true;
      }
    }
  }

  return {
    todoList: updatedTodoList,
    messages: toolMessages,
    actions: toolMessages.map((msg) => ({
      id: msg.tool_call_id,
      title: `Using tool: ${msg.name}`,
      displayContent: msg.content,
    })),
  };
}

async function finalResponseNode(state: StepByStepAgentState) {
  const llm = new ChatOpenAIResponses({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4.1-mini",
  });
  const result = await llm.invoke([
    new SystemMessage(finalResponseCompilerPrompt),
    ...state.messages,
  ]);

  return {
    messages: [result],
    actions: [
      {
        index: state.actions.length,
        title: "Writing final report.",
        displayContent: result.text,
      },
    ],
  };
}

export const StepByStepAgent = new StateGraph(StepByStepAgentStateAnnotation)
  .addNode("llm", llmNode)
  .addNode("tools", toolsNode)
  .addNode("final_response", finalResponseNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", ({ messages, todoList }) => {
    const lastMsg = messages.at(-1) as AIMessage;
    if (lastMsg && lastMsg.type === "ai") {
      if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
        return "tools";
      }
    }

    if (todoList.some((todo) => !todo.done)) {
      return "llm";
    }

    return END;
  })
  .addConditionalEdges("tools", (state) => {
    const isAllDone = state.todoList.every((todo) => todo.done);
    return isAllDone ? "final_response" : "llm";
  })
  .addEdge("final_response", END)
  .compile({ name: "StepByStepAgent" });
