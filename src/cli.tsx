import React from "react";
import { render, Box, Text, useApp, useStdout, useInput } from "ink";
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
import { toolsSet1 } from "@/toolsSet1";
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

const FullHeight: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { stdout } = useStdout();
  const getRows = () => stdout?.rows ?? (process.stdout as any)?.rows ?? 24;
  const [rows, setRows] = React.useState(getRows());

  React.useEffect(() => {
    const onResize = () => setRows(getRows());
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off?.("resize", onResize);
    };
  }, [stdout]);

  return (
    <Box flexDirection="column" minHeight={rows - 1}>
      {children}
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
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ message }) => {
  if (message instanceof HumanMessage) {
    return (
      <>
        <Box paddingTop={1} width={1}></Box>
        <Box flexDirection="column" paddingLeft={1} backgroundColor="#333">
          <Box>
            <RoleBadge message={message} />
            <Text wrap="wrap">{stringifyContent(message.content).trim()}</Text>
          </Box>
        </Box>
      </>
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
const MemoMessageView = React.memo(MessageView);

const App: React.FC = () => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState<
    Array<AIMessage | HumanMessage | ToolMessage>
  >(loadHistory(HISTORY_PATH));
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

  useInput(() => {});

  return (
    <FullHeight>
      <Box height={1} flexShrink={0}>
        <Text bold>AI CLI</Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Text dimColor italic>
          Commands: /clear to clear, /exit to exit, use \ to continue with a new
          line
        </Text>
      </Box>
      <Box>
        <Hr />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {messages.map((m, idx) => (
          <MemoMessageView
            key={m.id ?? idx}
            message={m}
            isFirst={idx === 0}
            isLast={idx === messages.length - 1}
          />
        ))}
        <Box flexGrow={1} />
      </Box>

      <Box height={1} flexShrink={0}>
        <Text color="gray" wrap="truncate-end">
          {busyStatus ?? ""}
        </Text>
      </Box>
      <Box height={1} flexShrink={0}>
        <Hr />
      </Box>
      <Box flexShrink={0} backgroundColor="#333">
        <Text>› </Text>
        <TextInput
          value={input}
          onChange={(v) => {
            if (!busyStatus) setInput(v);
          }}
          onSubmit={() => {
            if (input.trim().endsWith("\\")) {
              setInput(input.slice(0, -1) + "\n");
              return;
            }
            onSubmit(input);
          }}
          placeholder="Enter your message..."
        />
      </Box>
    </FullHeight>
  );
};

render(<App />);
