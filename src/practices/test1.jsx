import React, { useMemo, useRef, useState, useEffect } from "react";
import { render, Box, Text, Static, useInput } from "ink";
import TextInput from "ink-text-input";

const useStdoutDimensions = () => {
  const [cols, setCols] = useState(process.stdout.columns ?? 80);
  useEffect(() => {
    const onResize = () => setCols(process.stdout.columns ?? 80);
    process.stdout.on("resize", onResize);
    return () => process.stdout.off("resize", onResize);
  }, []);
  return [cols];
};

const Bubble = ({ from, text, width }) => {
  const isUser = from === "user";
  return (
    <Box
      width="100%"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      marginY={0.5}
    >
      <Box
        maxWidth={Math.max(10, Math.floor(width * 0.8))}
        paddingX={1}
        borderStyle="round"
        borderColor={isUser ? "cyan" : "green"}
      >
        <Text color={isUser ? "cyan" : "green"}>
          {isUser ? "You: " : "Bot: "}
        </Text>
        {/* Prevent reflow by wrapping within the bubble width */}
        <Text wrap="wrap">{text}</Text>
      </Box>
    </Box>
  );
};

// fake async bot (swap with your API call)
const replyFromBot = async (prompt) => {
  await new Promise((r) => setTimeout(r, 250));
  return `Echo: ${prompt}`;
};

const App = () => {
  const [cols] = useStdoutDimensions();
  const [pendingBot, setPendingBot] = useState(false);

  // messages kept IMMUTABLE in <Static>
  const [items, setItems] = useState([
    { id: 1, from: "bot", text: "Hey! Ask me anything." },
  ]);

  // input state + history
  const [input, setInput] = useState("");
  const history = useRef([]);
  const hIndex = useRef(-1);

  // capture global keys for history
  useInput((_, key) => {
    if (key.escape) setInput("");
    if (key.upArrow) {
      if (history.current.length === 0) return;
      if (hIndex.current + 1 < history.current.length) {
        hIndex.current += 1;
        setInput(history.current[hIndex.current]);
      }
    }
    if (key.downArrow) {
      if (hIndex.current > 0) {
        hIndex.current -= 1;
        setInput(history.current[hIndex.current]);
      } else if (hIndex.current === 0) {
        hIndex.current = -1;
        setInput("");
      }
    }
  });

  const header = useMemo(
    () => (
      <Box borderStyle="round" paddingX={1} justifyContent="center">
        <Text bold>Ink Chat • Ctrl+C to exit</Text>
      </Box>
    ),
    [],
  );

  const send = async (value) => {
    const text = value.trim();
    if (!text || pendingBot) return;

    // push user message as a NEW item (immutably)
    setItems((prev) => [...prev, { id: Date.now(), from: "user", text }]);

    // history
    history.current.unshift(text);
    hIndex.current = -1;

    setInput("");
    setPendingBot(true);
    try {
      const bot = await replyFromBot(text);
      setItems((prev) => [
        ...prev,
        { id: Date.now() + 1, from: "bot", text: bot },
      ]);
    } finally {
      setPendingBot(false);
    }
  };

  return (
    <Box flexDirection="column" width="100%">
      {header}

      {/* Past messages: rendered ONCE each; no flicker when input changes */}
      <Box marginTop={1} flexDirection="column">
        <Static items={items}>
          {(m) => (
            <Bubble key={m.id} from={m.from} text={m.text} width={cols} />
          )}
        </Static>
      </Box>

      {/* Reserved status line to avoid layout jump when toggling typing */}
      <Box height={1} marginTop={1}>
        <Text dimColor>{pendingBot ? "Bot is typing…" : " "}</Text>
      </Box>

      {/* Input row */}
      <Box marginTop={1}>
        <Text>› </Text>
        <TextInput
          value={input}
          onChange={(v) => v.length <= 500 && setInput(v)}
          onSubmit={send}
          placeholder="Type and press Enter…"
          focus
        />
      </Box>

      {/* Footer (fixed) */}
      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>Enter send • Esc clear • ↑/↓ history</Text>
        <Text dimColor>{input.length}/500</Text>
      </Box>
    </Box>
  );
};

render(<App />);
