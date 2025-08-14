import React from "react";
import { Box, Static, useApp } from "ink";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { invokeAgent } from "@/agent";
import type { ModelName } from "@/agent/models";
import { HeaderBar } from "@/cli/header";
import { Hr } from "@/cli/hr";
import { Input } from "@/cli/input";
import { MessageView } from "@/cli/messages";
import { StatusIndicator } from "@/cli/status-indicator";
import { Footer } from "@/cli/footer";
import { db, loadMessages, appendMessage, clearThread } from "@/db";
import { v4 } from "uuid";

export const App: React.FC<{
  model: ModelName;
  historyPath: string;
  tools: DynamicStructuredTool[];
}> = ({ model, historyPath, tools }) => {
  const { exit } = useApp();
  const [busyStatus, setBusyStatus] = React.useState<string | null>(null);
  const [allMessages, setAllMessages] = React.useState<BaseMessage[]>([]);
  const [activeMessages, setActiveMessages] =
    React.useState<BaseMessage | null>(null);
  const history = React.useMemo(() => {
    if (busyStatus) return [];
    return allMessages;
  }, [allMessages, busyStatus]);

  const onSubmit = async (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (trimmed === "/clear") {
      setBusyStatus("Clearing");
      await clearThread(db, historyPath);
      setAllMessages([]);
      setActiveMessages(null);
      setBusyStatus(null);
      return;
    }
    if (trimmed === "/exit") {
      exit();
      return;
    }

    let userMsg: HumanMessage | null = new HumanMessage({ content: trimmed });

    if (!trimmed) {
      const lastMsg = activeMessages || allMessages.at(-1);
      if (!lastMsg) {
        const failedAIMsg = new AIMessage({
          content: "Please enter a message to continue!",
        });
        setAllMessages((prev) => [...prev, userMsg!, failedAIMsg]);
        return;
      } else if (lastMsg?.getType() === "ai") {
        userMsg = new HumanMessage({ content: "Continue" });
      } else {
        userMsg = null;
      }
    }

    setBusyStatus("Processing");
    if (userMsg) {
      setActiveMessages(userMsg);
      await appendMessage(db, historyPath, userMsg);
    }

    await invokeAgent(
      model,
      tools,
      { historyPath },
      (messages, status = "Thinking") => {
        setBusyStatus(status);
        setAllMessages(messages.slice(0, messages.length - 1));
        setActiveMessages(messages.at(-1) ?? null);
      },
    );
    setAllMessages(await loadMessages(db, historyPath));
    setActiveMessages(null);
    setBusyStatus(null);
  };

  React.useEffect(() => {
    setBusyStatus("Loading");
    loadMessages(db, historyPath)
      .then(setAllMessages)
      .finally(() => setBusyStatus(null));
  }, []);

  return (
    <>
      <HeaderBar />
      <Hr />
      <Box flexDirection="column" paddingBottom={2}>
        <Static items={history}>
          {(msg) => (
            <MessageView
              key={(msg.id || "") + v4()}
              message={msg}
              isFirst={msg.id === allMessages[0].id}
              isLast={msg.id === allMessages[allMessages.length - 1].id}
            />
          )}
        </Static>
      </Box>
      {activeMessages ? (
        <Box flexDirection="column" paddingBottom={2}>
          <MessageView
            key={(activeMessages.id || "") + v4()}
            message={activeMessages}
            isFirst={activeMessages.id === allMessages[0].id}
            isLast={
              activeMessages.id === allMessages[allMessages.length - 1].id
            }
          />
        </Box>
      ) : null}
      <StatusIndicator status={busyStatus} />
      <Box
        flexDirection="column"
        flexShrink={0}
        paddingLeft={3}
        paddingRight={3}
      >
        <Input onSubmit={onSubmit} busyStatus={busyStatus} />
        <Footer
          model={model}
          messages={[
            ...allMessages,
            ...(activeMessages ? [activeMessages] : []),
          ]}
        />
      </Box>
    </>
  );
};
