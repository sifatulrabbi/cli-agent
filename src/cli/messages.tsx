import { Box, Text } from "ink";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import React from "react";

function formatJson(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function stringifyContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      if (
        c &&
        typeof c === "object" &&
        "type" in c &&
        (c as any).type === "text"
      ) {
        parts.push((c as any).text ?? "");
      } else {
        parts.push(formatJson(c));
      }
    }
    return parts.filter(Boolean).join("\n");
  }
  return formatJson(content);
}

export const RoleBadge: React.FC<{ message: BaseMessage }> = ({ message }) => {
  const user = message instanceof HumanMessage;
  const ai = message instanceof AIMessage;
  const tool = message instanceof ToolMessage;
  const color = ai ? "blue" : tool ? "yellow" : user ? "green" : "gray";
  const label = user ? "" : ai ? "AI" : tool ? "TOOL" : "";

  const BADGE_WIDTH = 6; // ensures consistent space for badge, prevents cramping
  const badgeText = `› ${label}`.padEnd(BADGE_WIDTH, " ");

  return (
    <Box marginRight={1} flexShrink={0} width={BADGE_WIDTH}>
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

export const MessageView: React.FC<{
  message: BaseMessage;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ message }) => {
  if (message instanceof HumanMessage) {
    return (
      <Box paddingTop={1} paddingRight={3} paddingLeft={3}>
        <Box
          paddingLeft={1}
          paddingRight={1}
          flexDirection="column"
          borderColor="white"
          borderStyle="single"
          width={"100%"}
        >
          <Text wrap="wrap">{stringifyContent(message.content).trim()}</Text>
        </Box>
      </Box>
    );
  }
  if (message instanceof AIMessage) {
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
      <Box flexDirection="column" paddingLeft={1}>
        <Box>
          <RoleBadge message={message} />
          <Box flexDirection="column">
            {reasoningTexts.length ? (
              <>
                <SectionHeader title="reasoning" />
                <Box flexDirection="column" gap={0} paddingBottom={1}>
                  <Text color="gray" wrap="wrap" italic>
                    {reasoningTexts.map((txt) => txt.trim()).join("")}
                  </Text>
                </Box>
              </>
            ) : null}
            {message.content ? (
              <Text wrap="wrap">
                {stringifyContent(message.content).trim()}
              </Text>
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
      </Box>
    );
  }
  if (message instanceof ToolMessage) {
    const toolName = message.name as string | undefined;
    return (
      <Box flexDirection="column" paddingLeft={1}>
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
              {message.status || "unknown"}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }
  return null;
};
