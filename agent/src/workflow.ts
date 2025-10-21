import z from "zod";
import { ChatOpenAIResponses } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { entrypoint, task } from "@langchain/langgraph";
import { BasicAgent } from "./agents/basic_agent";
import { StepByStepAgent } from "./agents/step_by_step_agent";
import { PlanningAgent } from "./agents/planning_agent";
import { timing } from "./utils";

const analyzerOutputSchema = z.object({ complexity: z.enum(["low", "high"]) });

const analyzeComplexity = task(
  "analyzeComplexity",
  async (userInput: string) => {
    const gpt5Chat = new ChatOpenAIResponses({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4.1-nano",
    }).withStructuredOutput<z.infer<typeof analyzerOutputSchema>>(
      analyzerOutputSchema,
    );
    const result = await gpt5Chat.invoke([
      new SystemMessage(
        "Analyze the user's request then return a proper complexity level for the request.",
      ),
      new HumanMessage({ content: userInput }),
    ]);
    return result.complexity;
  },
);

const writePlanForUserRequest = task(
  "writePlanForUserRequest",
  async (userInput: string) => {
    const finalState = await PlanningAgent.invoke({
      messages: [new HumanMessage(userInput)],
    });
    return finalState.todoList;
  },
);

export const workflow = entrypoint(
  { name: "AutoPlannerAgent" },
  async ({ userInput }: { userInput: string }) => {
    const complexityLevel = await timing(
      analyzeComplexity(userInput),
      "analyzeComplexity",
    );

    const userMsg = new HumanMessage(userInput);
    if (complexityLevel === "low") {
      const finalState = await BasicAgent.invoke({
        messages: [userMsg],
      });
      return finalState;
    }

    const todoList = await timing(
      writePlanForUserRequest(userInput),
      "createPlan",
    );

    const finalState = await StepByStepAgent.invoke({
      messages: [userMsg],
      todoList,
    });
    return finalState;
  },
);
