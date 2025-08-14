import { Box, Text, useStdout } from "ink";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import React from "react";

export const RoleBadge: React.FC<{ message: BaseMessage }> = ({ message }) => {
  const user = message instanceof HumanMessage;
  const ai = message instanceof AIMessage;
  const tool = message instanceof ToolMessage;
  const color = ai ? "blue" : tool ? "yellow" : user ? "green" : "gray";
  const label = user ? "" : ai ? "AI" : tool ? "TOOL" : "";
  const badgeText = `› ${label}`;

  return (
    <Box marginRight={1}>
      <Text color={color} bold>
        {badgeText}
      </Text>
    </Box>
  );
};

const SectionHeader: React.FC<{ title: string; color?: string }> = ({
  title,
  color,
}) => (
  <Box>
    <Text dimColor={!color} color={color} bold>
      {title}
    </Text>
  </Box>
);

const RenderMsgContent: React.FC<{
  content: any;
}> = ({ content }) => {
  const textChunks: { text: string; type: string }[] = [];

  if (typeof content === "string") {
    textChunks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const c of content) {
      if (!c) continue;
      if (typeof c === "string") {
        textChunks.push({ type: "text", text: c });
        continue;
      }
      if (typeof c === "object" && "type" in c) {
        if ((c as any).type === "text") {
          textChunks.push({ type: "text", text: (c as any).text ?? "" });
        } else if ((c as any).type === "image_url") {
          textChunks.push({
            type: "image",
            text: (c as any).image_url?.url ?? "[Image file]",
          });
        }
      }
    }
  }

  // TODO: show till the edge of the screen
  return textChunks.map((chunk, idx) => (
    <Text
      key={idx.toString() + chunk.text}
      wrap="wrap"
      dimColor={chunk.type !== "text"}
    >
      {chunk.type !== "text" ? " [" + chunk.type.toUpperCase() + "] " : ""}
      {chunk.type !== "text" ? chunk.text.slice(0, 80) : chunk.text}
    </Text>
  ));
};

const HumanMessageView: React.FC<{
  message: HumanMessage;
}> = ({ message }) => {
  return (
    <Box paddingTop={1} paddingRight={3} paddingLeft={3}>
      <Box
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
        borderColor="white"
        borderStyle="single"
        width="100%"
      >
        <RenderMsgContent content={message.content} />
      </Box>
    </Box>
  );
};

const AIMessageView: React.FC<{
  message: AIMessage;
}> = ({ message }) => {
  const toolCalls = message.tool_calls ?? [];

  const reasoningTexts: string[] = [];
  const reasoningItems =
    message?.response_metadata?.output?.filter(
      (item: any) => item?.type === "reasoning",
    ) || [];
  reasoningItems?.forEach((item: any) => {
    if (item?.summary) {
      reasoningTexts.push(...item.summary.map((s: any) => s.text));
    }
  });
  const reasoning = message.additional_kwargs?.reasoning as any;
  if (reasoning && reasoning.summary) {
    reasoningTexts.push(...reasoning.summary.map((s: any) => s.text));
  }

  return (
    <Box paddingTop={1} paddingRight={3} paddingLeft={3} width="100%">
      <Box width={6} flexShrink={0}>
        <RoleBadge message={message} />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {reasoningTexts.length ? (
          <>
            <SectionHeader title="reasoning" />
            <Box flexDirection="column" paddingBottom={1}>
              <Text color="gray" wrap="wrap" italic>
                {reasoningTexts.map((txt) => txt.trim()).join(" ")}
              </Text>
            </Box>
          </>
        ) : null}

        {message.content ? (
          <RenderMsgContent content={message.content} />
        ) : null}

        {toolCalls.length > 0 ? (
          <>
            <SectionHeader title="tool calls" color="blue" />
            {toolCalls.map((tc, idx) => (
              <Box
                key={(tc.id ?? idx).toString()}
                flexDirection="column"
                paddingLeft={2}
              >
                <Text dimColor>↳ {tc.name}</Text>
              </Box>
            ))}
          </>
        ) : null}
      </Box>
    </Box>
  );
};

const ToolMessageView: React.FC<{
  message: ToolMessage;
}> = ({ message }) => {
  const toolName = message.name as string | undefined;

  return (
    <Box paddingTop={1} paddingRight={3} paddingLeft={3}>
      <Box>
        <RoleBadge message={message} />
        <Box flexDirection="row" gap={1}>
          <Text dimColor>↳ {toolName ?? "unknown"}</Text>
          <Text dimColor>{"->"}</Text>
          <Text
            dimColor
            color={
              message.status === "error"
                ? "red"
                : message.status === "success"
                ? "green"
                : "yellow"
            }
          >
            {message.status || "executing..."}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export const MessageView: React.FC<{
  message: BaseMessage;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ message }) => {
  const { stdout } = useStdout();
  const cols = React.useMemo(() => stdout.columns, [stdout.columns]);

  return (
    <Box flexDirection="column" width={cols} flexWrap="wrap">
      {message instanceof HumanMessage ? (
        <HumanMessageView message={message} />
      ) : message instanceof AIMessage ? (
        <AIMessageView message={message} />
      ) : message instanceof ToolMessage ? (
        <ToolMessageView message={message} />
      ) : null}
    </Box>
  );
};
