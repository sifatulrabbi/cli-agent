import React from "react";
import { Box, useApp } from "ink";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { loadHistory, ModelName } from "@/agent";
import { invokeAgent } from "@/agent";
import { clearHistory } from "@/agent";
import { addMsgToHistory } from "@/agent";
import { HeaderBar } from "@/cli/header";
import { FullHeight } from "@/cli/full-height";
import { Hr } from "@/cli/hr";
import { Input } from "@/cli/input";
import { MessageView } from "@/cli/messages";
import { StatusIndicator } from "@/cli/status-indicator";
import { Footer } from "@/cli/footer";

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

    setBusyStatus("Processing");

    let userMsg: HumanMessage | null = new HumanMessage({ content: trimmed });

    if (!trimmed) {
      const lastMsg = messages.at(-1);
      if (!lastMsg) {
        const failedAIMsg = new AIMessage({
          content: "Please enter a message to continue!",
        });
        setMessages((prev) => [...prev, userMsg!, failedAIMsg]);
        setBusyStatus(null);
        return;
      } else if (lastMsg?.getType() === "ai") {
        userMsg = new HumanMessage({ content: "Continue" });
      } else {
        userMsg = null;
      }
    }
    if (userMsg) addMsgToHistory(historyPath, userMsg);

    invokeAgent(
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
      <Box flexDirection="column" flexGrow={1} paddingBottom={2}>
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
      <Box
        flexDirection="column"
        flexShrink={0}
        paddingLeft={3}
        paddingRight={3}
      >
        <Input onSubmit={onSubmit} busyStatus={busyStatus} />
        <Footer model={model} messages={messages} />
      </Box>
    </FullHeight>
  );
};
