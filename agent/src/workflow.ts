import z from "zod";
import { ChatOpenAIResponses } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { entrypoint, task } from "@langchain/langgraph";
import { BasicAgent } from "./agents/basic_agent";
import { StepByStepAgent } from "./agents/step_by_step_agent";
import { PlanningAgent } from "./agents/planning_agent";

const analyzerOutputSchema = z.object({ complexity: z.enum(["low", "high"]) });

const analyzeComplexity = task(
  "analyzeComplexity",
  async (userMsg: HumanMessage) => {
    const llm = new ChatOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4.1-nano",
    }).withStructuredOutput<z.infer<typeof analyzerOutputSchema>>(
      analyzerOutputSchema,
    );
    const result = await llm.invoke([
      new SystemMessage(
        "Analyze the user's request then return a proper complexity level for the request.",
      ),
      userMsg,
    ]);
    return result.complexity;
  },
);

const writePlanForUserRequest = task(
  "writePlanForUserRequest",
  async (userMsg: HumanMessage) => {
    const finalState = await PlanningAgent.invoke({
      messages: [userMsg],
    });
    return finalState.todoList;
  },
);

export const workflow = entrypoint(
  { name: "AutoPlannerAgent" },
  async ({ userInput }: { userInput: string }) => {
    const userMsg = new HumanMessage(userInput);

    const complexityLevel = await analyzeComplexity(userMsg);

    if (complexityLevel === "low") {
      const finalState = await BasicAgent.invoke({
        messages: [userMsg],
      });
      return finalState;
    }

    const todoList = await writePlanForUserRequest(userMsg);

    const finalState = await StepByStepAgent.invoke({
      messages: [userMsg],
      todoList,
    });
    return finalState;
  },
);
