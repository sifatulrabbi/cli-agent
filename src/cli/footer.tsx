import React from "react";
import { Box, Text } from "ink";
import { BaseMessage } from "@langchain/core/messages";

const modelInfo: Record<string, { description: string }> = {
  gpt41mini: { description: "OpenAI gpt-4.1-mini" },
  gpt41: { description: "OpenAI gpt-4.1" },
  gpt4o: { description: "OpenAI gpt-4o" },
  gpt4oMini: { description: "OpenAI gpt-4o-mini" },
  gptOss20bLocal: {
    description: "Locally hosted gpt-oss-20b (reasoning: high)",
  },
  codexMini: { description: "OpenAI codex-mini" },
  o4Mini: { description: "OpenAI o4-mini (reasoning: low)" },
  o4MiniHigh: { description: "OpenAI o4-mini (reasoning: high)" },
  gpt5: { description: "OpenAI gpt-5 (reasoning: minimal)" },
  gpt5High: { description: "OpenAI gpt-5 (reasoning: high)" },
  gpt5Mini: { description: "OpenAI gpt-5-mini (reasoning: minimal)" },
  gpt5MiniHigh: { description: "OpenAI gpt-5-mini (reasoning: high)" },
  gptOss20bHigh: {
    description: "OpenRouter gpt-oss-20b (reasoning: high)",
  },
  gptOss120bHigh: {
    description: "OpenRouter gpt-oss-120b (reasoning: high)",
  },
  zAiGlm45: { description: "OpenRouter z-ai/glm-4.5v" },
};

export const Footer: React.FC<{ messages: BaseMessage[]; model: string }> = ({
  messages,
  model,
}) => {
  const inputTokens = React.useMemo(
    () =>
      messages.reduce((total, msg: any) => {
        if (msg.getType() === "ai") {
          const usage =
            msg.usage_metadata || msg.additional_kwargs.usage_metadata;
          return total + (usage?.input_tokens ?? 0);
        }
        return total;
      }, 0),
    [messages],
  );
  const outputTokens = React.useMemo(
    () =>
      messages.reduce((total, msg: any) => {
        if (msg.getType() === "ai") {
          const usage =
            msg.usage_metadata || msg.additional_kwargs.usage_metadata;
          return total + (usage?.output_tokens ?? 0);
        }
        return total;
      }, 0),
    [messages],
  );
  const totalTokens = React.useMemo(
    () =>
      messages.reduce((total, msg: any) => {
        if (msg.getType() === "ai") {
          const usage =
            msg.usage_metadata || msg.additional_kwargs.usage_metadata;
          return total + (usage?.total_tokens ?? 0);
        }
        return total;
      }, 0),
    [messages],
  );

  return (
    <Box width="100%" flexDirection="column" justifyContent="space-between">
      <Box height={1} flexShrink={0} justifyContent="space-between">
        <Text dimColor>{modelInfo[model]?.description ?? model}</Text>
        <Text dimColor>
          Token usage: {totalTokens.toLocaleString()} |
          {" ▲ " + inputTokens.toLocaleString()} |
          {" ▼ " + outputTokens.toLocaleString()}
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text dimColor>/ for commands</Text>
      </Box>
    </Box>
  );
};
