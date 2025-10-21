export function getOpenRouterConfig() {
  return {
    API_KEY: process.env.OPENROUTER_API_KEY,
    BASE_URL: "https://openrouter.ai/api/v1",
  };
}

export function getOpenAIConfig() {
  return {
    API_KEY: process.env.OPENAI_API_KEY,
  };
}
