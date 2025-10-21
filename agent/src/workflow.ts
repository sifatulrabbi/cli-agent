import { HumanMessage } from "@langchain/core/messages";
import { entrypoint, task } from "@langchain/langgraph";
import { BasicAgent } from "./agents/basic_agent";
import { StepByStepAgent, type AgentTodo } from "./agents/step_by_step_agent";
import { PlanningAgent } from "./agents/planning_agent";

const writePlanForUserRequest = task(
  "writePlanForUserRequest",
  async (userMsg: HumanMessage) => {
    const finalState = await PlanningAgent.invoke({
      messages: [userMsg],
    });
    return finalState.todoList;
  },
);

const invokeBasicAgent = task(
  "BasicAgentTask",
  async (userMsg: HumanMessage) => {
    const finalState = await BasicAgent.invoke(
      { messages: [userMsg] },
      { recursionLimit: 10 ** 10 },
    );
    return finalState;
  },
);

const invokeComplexAgent = task(
  "ComplexAgentTask",
  async (userMsg: HumanMessage, todoList: AgentTodo[]) => {
    const finalState = await StepByStepAgent.invoke(
      {
        messages: [userMsg],
        todoList,
      },
      { recursionLimit: 10 ** 10 },
    );
    return finalState;
  },
);

export const workflow = entrypoint(
  { name: "AutoPlannerAgent" },
  async ({ userInput }: { userInput: string }) => {
    const userMsg = new HumanMessage(userInput);
    const basicAgentResponse = await invokeBasicAgent(userMsg);
    if (!basicAgentResponse.handover) {
      return basicAgentResponse;
    }
    const todoList = await writePlanForUserRequest(userMsg);
    console.log(JSON.stringify(todoList, undefined, 2));
    const result = await invokeComplexAgent(userMsg, todoList);
    return result;
  },
);
