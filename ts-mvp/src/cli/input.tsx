import React from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export const Input: React.FC<{
  onSubmit: (input: string) => void;
  busyStatus: string | null;
}> = ({ onSubmit, busyStatus }) => {
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
    <Box flexShrink={0} borderColor="white" borderStyle="single">
      <Text>› </Text>
      <TextInput
        value={input}
        onChange={() => {}}
        placeholder="Enter your message"
      />
    </Box>
  );
};
