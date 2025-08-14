import { ChatOpenAI } from "@langchain/openai";

export const models = {
  gpt41mini: new ChatOpenAI({
    model: "gpt-4.1-mini",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt41: new ChatOpenAI({
    model: "gpt-4.1",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt4o: new ChatOpenAI({
    model: "gpt-4o",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt4oMini: new ChatOpenAI({
    model: "gpt-4o-mini",
    useResponsesApi: true,
    streamUsage: true,
  }),
  gptOss20bLocal: new ChatOpenAI({
    model: "openai/gpt-oss-20b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    configuration: {
      baseURL: "http://127.0.0.1:8089/v1",
    },
    streamUsage: true,
  }),
  codexMini: new ChatOpenAI({
    model: "codex-mini",
    useResponsesApi: true,
    streamUsage: true,
  }),
  o4Mini: new ChatOpenAI({
    model: "o4-mini",
    reasoning: {
      effort: "low",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  o4MiniHigh: new ChatOpenAI({
    model: "o4-mini",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5: new ChatOpenAI({
    model: "gpt-5",
    reasoning: {
      effort: "minimal",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5High: new ChatOpenAI({
    model: "gpt-5",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5Mini: new ChatOpenAI({
    model: "gpt-5-mini",
    reasoning: {
      effort: "minimal",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gpt5MiniHigh: new ChatOpenAI({
    model: "gpt-5-mini",
    reasoning: {
      effort: "high",
      summary: "auto",
    },
    useResponsesApi: true,
    streamUsage: true,
  }),
  gptOss20bHigh: new ChatOpenAI({
    model: "openai/gpt-oss-20b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
  gptOss120bHigh: new ChatOpenAI({
    model: "openai/gpt-oss-120b",
    modelKwargs: {
      reasoning_effort: "high",
    },
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
  zAiGlm45: new ChatOpenAI({
    model: "z-ai/glm-4.5v",
    apiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    streamUsage: true,
  }),
};

export type ModelName = keyof typeof models;
