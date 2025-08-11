import { useEffect, useState } from "react";
import { render, Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import { HumanMessage, isAIMessageChunk } from "@langchain/core/messages";
import { graph, ensureGeneratedDir } from "./agent.js";

type Role = "user" | "assistant" | "tool";
type ChatItem = { role: Role; text: string };

const toText = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : (c as any)?.text ?? ""))
      .join("");
  }
  return "";
};

const createChatItem = (role: Role, text: string): ChatItem => ({ role, text });

const getMessageType = (m: any): string | undefined => {
  try {
    if (typeof m?.getType === "function") return m.getType();
  } catch {}
  if (typeof m?.type === "string") return m.type;
  return undefined;
};

const getToolNameFromMessage = (m: any): string | undefined => {
  if (!m || typeof m !== "object") return undefined;
  if (typeof (m as any).name === "string") return (m as any).name;
  const ak = (m as any).additional_kwargs;
  if (ak && typeof ak === "object" && typeof ak.tool_name === "string") {
    return ak.tool_name;
  }
  return undefined;
};

const readToolCallsFromAIMessage = (
  m: any,
): Array<{ id?: string; name?: string }> => {
  const out: Array<{ id?: string; name?: string }> = [];
  if (!m || typeof m !== "object") return out;
  const ak = (m as any).additional_kwargs;
  const direct = (m as any).tool_calls;
  const sources = [
    Array.isArray(ak?.tool_calls) ? ak.tool_calls : undefined,
    Array.isArray(direct) ? direct : undefined,
  ].filter(Boolean) as any[];
  for (const arr of sources) {
    for (const tc of arr as any[]) {
      const id = typeof tc?.id === "string" ? tc.id : undefined;
      const name =
        typeof tc?.name === "string"
          ? tc.name
          : typeof tc?.function?.name === "string"
          ? tc.function.name
          : undefined;
      out.push({ id, name });
    }
  }
  return out;
};

const Divider = () => {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  return <Text color="blue">{"─".repeat(width)}</Text>;
};

const Message = ({ role, text }: ChatItem) => {
  const label =
    role === "user" ? "You> " : role === "tool" ? "Tool> " : "Agent> ";
  return (
    <Box marginBottom={1}>
      <Text>
        <Text color="blue">{label}</Text>
        <Text>{text}</Text>
      </Text>
    </Box>
  );
};

const App = () => {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);

  useEffect(() => {
    void ensureGeneratedDir();
  }, []);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    setInput("");
    if (!trimmed) return;
    if (["exit", "quit", "q"].includes(trimmed.toLowerCase())) {
      exit();
      return;
    }

    setItems((prev) => [...prev, { role: "user", text: trimmed }]);
    setBusy(true);

    try {
      let aiIndex = -1;
      const ensureAssistant = () => {
        if (aiIndex >= 0) return;
        setItems((prev) => {
          aiIndex = prev.length;
          return [...prev, { role: "assistant", text: "" }];
        });
      };

      const announcedToolKeys: Set<string> = new Set();

      const stream = await graph.stream(
        { messages: [new HumanMessage(trimmed)] },
        { streamMode: "messages" },
      );

      let sawAny = false;
      let finalAI: any = null;

      for await (const [message] of stream as any) {
        if (isAIMessageChunk(message)) {
          const delta = toText(message?.content);
          if (delta) {
            ensureAssistant();
            sawAny = true;
            setItems((prev) =>
              prev.map((m, i) =>
                i === aiIndex ? { ...m, text: m.text + delta } : m,
              ),
            );
          }

          const callChunks = message?.tool_call_chunks as
            | Array<any>
            | undefined;
          if (Array.isArray(callChunks) && callChunks.length > 0) {
            for (const callChunk of callChunks) {
              const idx =
                typeof callChunk?.index === "number" ? callChunk.index : 0;
              const key =
                (typeof callChunk?.id === "string" && callChunk.id) ||
                `chunk:${idx}`;
              if (!announcedToolKeys.has(key)) {
                announcedToolKeys.add(key);
                const name = (callChunk?.name as string | undefined) ?? "tool";
                setItems((prev) => [
                  ...prev,
                  { role: "assistant", text: `Using ${name}...` },
                ]);
              }
            }
          }
          continue;
        }

        if (message && typeof message === "object") {
          const msgType = getMessageType(message);
          if (msgType === "tool") {
            const toolName = getToolNameFromMessage(message) ?? "tool";
            // const toolContent = toText((message as any)?.content);
            setItems((prev) => [
              ...prev,
              createChatItem("tool", `${toolName} done executing`),
              //   ...(toolContent ? [createChatItem("tool", toolContent)] : []),
            ]);
            continue;
          }

          const toolCalls = readToolCallsFromAIMessage(message);
          if (toolCalls.length > 0) {
            for (let i = 0; i < toolCalls.length; i++) {
              const tc = toolCalls[i];
              const key = (tc.id as string | undefined) ?? `final:${i}`;
              if (announcedToolKeys.has(key)) continue;
              announcedToolKeys.add(key);
              const name = (tc.name as string | undefined) ?? "tool";
              setItems((prev) => [
                ...prev,
                { role: "assistant", text: `Using ${name}...` },
              ]);
            }
          }
          finalAI = message;
          const text = toText((message as any)?.content);
          if (!text) continue;
          ensureAssistant();
          setItems((prev) =>
            prev.map((m, i) => (i === aiIndex ? { ...m, text } : m)),
          );
        }
      }

      if (!sawAny && finalAI) {
        const text = toText((finalAI as any)?.content);
        if (text) {
          ensureAssistant();
          setItems((prev) =>
            prev.map((m, i) =>
              i === aiIndex ? { ...m, text: m.text + text } : m,
            ),
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setItems((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${msg}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="blue">Chat</Text>
      <Box flexDirection="column" marginBottom={1}>
        {items.map((m, i) => (
          <Message key={i} role={m.role} text={m.text} />
        ))}
        {busy ? <Text color="blue">Thinking…</Text> : null}
      </Box>
      <Divider />
      <Box>
        <Text color="blue">You&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          focus={!busy}
          placeholder={busy ? "" : "Type a message, or 'exit' to quit"}
        />
      </Box>
    </Box>
  );
};

render(<App />);
