import { Box, Text, useInput } from "ink";
import React from "react";

const modelInfo: Record<string, { description: string }> = {
  gpt41mini: {
    description: "OpenAI gpt-4.1-mini",
  },
  gpt41: {
    description: "OpenAI gpt-4.1",
  },
  gptOss120b: {
    description: "OpenRouter gpt-oss-120b (reasoning: high)",
  },
  codexMini: {
    description: "OpenAI codex-mini",
  },
  o4MiniHigh: {
    description: "OpenAI o4-mini (reasoning: high)",
  },
  gpt5: {
    description: "OpenAI gpt-5 (reasoning: minimal)",
  },
  gpt5High: {
    description: "OpenAI gpt-5 (reasoning: high)",
  },
  gpt5MiniHigh: {
    description: "OpenAI gpt-5-mini (reasoning: high)",
  },
};

export const Input: React.FC<{
  onSubmit: (input: string) => void;
  busyStatus: string | null;
  model: string;
}> = ({ onSubmit, busyStatus, model }) => {
  const [input, setInput] = React.useState("");

  useInput((val, key) => {
    if (busyStatus) return;

    if (key.return) {
      if (input.trim().endsWith("\\")) {
        setInput((prev) => prev.trim().slice(0, -1) + "\n");
      } else {
        const msg = (input + val).trim();
        setInput("");
        onSubmit(msg);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    setInput((prev) => prev + val);
  });

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={0}
      paddingLeft={3}
      paddingRight={3}
    >
      <Box flexShrink={0} borderColor="white" borderStyle="single">
        <Text>› </Text>
        <Text dimColor={!input}>{input || "Enter your message"}</Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text dimColor>{modelInfo[model]?.description ?? model}</Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text dimColor>/ for commands</Text>
      </Box>
    </Box>
  );
};
