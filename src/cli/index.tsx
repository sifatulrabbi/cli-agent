import React from "react";
import { Box, useApp } from "ink";
import { HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { loadHistory, ModelName } from "@/agent";
import { invokeDebuggerAgent } from "@/agent";
import { clearHistory } from "@/agent";
import { addMsgToHistory } from "@/agent";
import { HeaderBar } from "@/cli/header";
import { FullHeight } from "@/cli/full-height";
import { Hr } from "@/cli/hr";
import { Input } from "@/cli/input";
import { MessageView } from "@/cli/messages";
import { StatusIndicator } from "@/cli/status-indicator";

export const App: React.FC<{
  model: ModelName;
  historyPath: string;
  tools: DynamicStructuredTool[];
}> = ({ model, historyPath, tools }) => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState(loadHistory(historyPath));
  const [busyStatus, setBusyStatus] = React.useState<string | null>(null);

  const onSubmit = (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (trimmed === "/clear") {
      setBusyStatus("Clearing");
      clearHistory(historyPath);
      setMessages([]);
      setBusyStatus(null);
      return;
    }
    if (trimmed === "/exit") {
      exit();
      return;
    }

    const userMsg = new HumanMessage({ content: trimmed });
    setBusyStatus("Processing");
    addMsgToHistory(historyPath, userMsg);
    invokeDebuggerAgent(
      model,
      tools,
      { historyPath },
      (messages, status = "Thinking") => {
        setMessages(messages);
        setBusyStatus(status);
      },
    ).finally(() => {
      setBusyStatus(null);
    });
  };

  return (
    <FullHeight>
      <HeaderBar />
      <Hr />
      <Box flexDirection="column" flexGrow={1}>
        {messages.map((m, idx) => (
          <MessageView
            key={m.id ?? idx}
            message={m}
            isFirst={idx === 0}
            isLast={idx === messages.length - 1}
          />
        ))}
      </Box>
      <StatusIndicator status={busyStatus} />
      <Input onSubmit={onSubmit} busyStatus={busyStatus} model={model} />
    </FullHeight>
  );
};
