import React, { useEffect } from "react";
import { render, Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  loadHistory,
  models,
  invokeDebuggerAgent,
  addMsgToHistory,
  clearHistory,
} from "@/agent";
import { toolsSet1 } from "./toolsSet1";
import dotenv from "dotenv";

dotenv.config();

const HISTORY_PATH = "benchmarks/results/gpt-oss-120b.json";

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

const Hr: React.FC<{ char?: string; color?: string }> = ({
  char = "─",
  color,
}) => {
  const { stdout } = useStdout();
  const getCols = () => stdout?.columns ?? process.stdout.columns ?? 80;
  const [cols, setCols] = React.useState(getCols());

  React.useEffect(() => {
    const onResize = () => setCols(getCols());
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off?.("resize", onResize);
    };
  }, [stdout]);

  return (
    <Box>
      <Text color={color}>{char.repeat(Math.max(0, cols))}</Text>
    </Box>
  );
};

const RoleBadge: React.FC<{ message: BaseMessage }> = ({ message }) => {
  const user = message instanceof HumanMessage;
  const ai = message instanceof AIMessage;
  const tool = message instanceof ToolMessage;
  const color = ai ? "blue" : tool ? "yellow" : user ? "green" : "gray";
  const label = user ? "USER" : ai ? "AI" : tool ? "TOOL" : "";

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

const MessageView: React.FC<{
  message: BaseMessage;
}> = ({ message }) => {
  if (message instanceof HumanMessage) {
    return (
      <Box flexDirection="column" paddingLeft={1} paddingTop={2}>
        <Box>
          <RoleBadge message={message} />
          <Text wrap="wrap">{stringifyContent(message.content).trim()}</Text>
        </Box>
      </Box>
    );
  }
  if (message instanceof AIMessage) {
    const reasoningTexts: string[] = [];
    const toolCalls = message.tool_calls ?? [];
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box>
          <RoleBadge message={message} />
          <Box flexDirection="column">
            {reasoningTexts.length ? (
              <>
                <SectionHeader title="reasoning" />
                {reasoningTexts.map((rt, idx) => (
                  <Box paddingLeft={2} key={`rs-${idx}`}>
                    <Text color="gray" wrap="wrap">
                      {rt}
                    </Text>
                  </Box>
                ))}
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
                    <Text>
                      ↳ <Text bold>{tc.name}</Text>{" "}
                      {tc.id ? <Text dimColor>#{tc.id}</Text> : null}
                    </Text>
                    <Box paddingLeft={2}>
                      <Text color="yellow">args</Text>
                    </Box>
                    <Box paddingLeft={4}>
                      <Text wrap="wrap" dimColor>
                        {formatJson(tc.args).slice(0, 100)}
                        {"..."}
                      </Text>
                    </Box>
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
    const toolId = (message as any).tool_call_id as string | undefined;
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Box>
          <RoleBadge message={message} />
          <Box flexDirection="column">
            <Text>↳ for {toolId ?? "unknown"}</Text>
            <Box paddingLeft={2}>
              <Text wrap="wrap" dimColor>
                {stringifyContent(message.content).slice(0, 100)}
                {"..."}
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }
  return null;
};
const MemoMessageView = React.memo(MessageView);

const App: React.FC = () => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState<
    Array<AIMessage | HumanMessage | ToolMessage>
  >([]);
  const [input, setInput] = React.useState("");
  const [busyStatus, setBusyStatus] = React.useState<string | null>(null);

  const onSubmit = (v: string) => {
    const trimmed = v.trim();
    if (trimmed === "/clear") {
      setBusyStatus("clearing...");
      clearHistory(HISTORY_PATH);
      setMessages([]);
      setInput("");
      setBusyStatus(null);
      return;
    }
    if (trimmed === "/exit") {
      exit();
      return;
    }

    const userMsg = new HumanMessage({ content: trimmed });
    setBusyStatus("processing...");
    // setSelectedIndex(messages.length);
    addMsgToHistory(HISTORY_PATH, userMsg);
    setInput("");
    invokeDebuggerAgent(
      models.gptOss120b,
      toolsSet1,
      { historyPath: HISTORY_PATH },
      (messages, status = "thinking...") => {
        setMessages(messages);
        setBusyStatus(status);
      },
    ).finally(() => {
      setBusyStatus(null);
    });
  };

  useEffect(() => {
    setMessages(loadHistory(HISTORY_PATH));
  }, []);

  return (
    <Box flexDirection="column">
      <Text>AI CLI</Text>
      <Box>
        <Text dimColor>Commands: /clear to clear | /exit to exit</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {messages.map((m, idx) => (
          <MemoMessageView key={m.id ?? idx} message={m} />
        ))}
      </Box>
      {busyStatus && (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray" wrap="wrap">
            {busyStatus}
          </Text>
        </Box>
      )}
      <Box>
        <Hr />
      </Box>
      <Box marginTop={1} borderTop>
        <Text>› </Text>
        <TextInput
          value={input}
          onChange={(v) => {
            if (!busyStatus) setInput(v);
          }}
          onSubmit={(v) => {
            if (!busyStatus) onSubmit(v);
          }}
          placeholder="/clear to clear | /exit to exit"
        />
      </Box>
    </Box>
  );
};

render(<App />);
