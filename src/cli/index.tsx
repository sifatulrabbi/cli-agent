import React from "react";
import { Box, Static, useApp } from "ink";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { invokeAgent } from "@/agent";
import type { ModelName } from "@/agent/models";
import { HeaderBar } from "@/cli/header";
import { Input } from "@/cli/input";
import { MessageView } from "@/cli/messages";
import { StatusBar } from "@/cli/status-bar";
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
  const [activeMessage, setActiveMessage] = React.useState<BaseMessage | null>(
    null,
  );
  const [infoMsg, setInfoMsg] = React.useState("");
  const [errorMsg, setErrorMsg] = React.useState("");

  const onSubmit = (inputValue: string) => {
    const trimmed = inputValue.trim();
    if (trimmed === "/clear") {
      setBusyStatus("Clearing");
      clearThread(db, historyPath).then(() => {
        setAllMessages([]);
        setActiveMessage(null);
        setBusyStatus(null);
        setInfoMsg("Conversation history cleared.");
      });
      return;
    }
    if (trimmed === "/exit") {
      exit();
      return;
    }
    if (!trimmed) {
      setErrorMsg("Please enter a message to continue!");
      return;
    }

    const userMsg = new HumanMessage({ content: trimmed });
    setBusyStatus("Processing");
    setActiveMessage(userMsg);
    appendMessage(db, historyPath, userMsg).then(() => {
      invokeAgent(
        model,
        tools,
        { historyPath },
        (messages, status = "Thinking") => {
          setBusyStatus(status);
          setAllMessages(messages.slice(0, messages.length - 1));
          setActiveMessage(messages.at(-1) ?? null);
        },
      ).finally(() => {
        setActiveMessage(null);
        setBusyStatus(null);
      });
    });
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
      <Box flexDirection="column" paddingBottom={2}>
        <Static items={allMessages}>
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
      {activeMessage ? (
        <Box flexDirection="column" paddingBottom={2}>
          <MessageView
            key={(activeMessage.id || "") + v4()}
            message={activeMessage}
            isFirst={activeMessage.id === allMessages[0].id}
            isLast={activeMessage.id === allMessages[allMessages.length - 1].id}
          />
        </Box>
      ) : null}
      <StatusBar status={busyStatus} error={errorMsg} message={infoMsg} />
      <Box
        flexDirection="column"
        flexShrink={0}
        paddingLeft={3}
        paddingRight={3}
      >
        <Input onSubmit={onSubmit} busyStatus={busyStatus} />
        <Footer
          model={model}
          messages={[...allMessages, ...(activeMessage ? [activeMessage] : [])]}
        />
      </Box>
    </>
  );
};
