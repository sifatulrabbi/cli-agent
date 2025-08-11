import { HumanMessage } from "@langchain/core/messages";
import React, { useEffect, useState } from "react";
import { render, Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { graph, ensureGeneratedDir, extractReasoningText } from "./agent.js";

const extractTextFromContentArray = (arr: unknown[]): string => {
  return arr
    .map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "text" in (c as any)) {
        return (c as any).text ?? "";
      }
      return "";
    })
    .join("");
};

const formatAssistantMessage = (msg: any): string => {
  if (msg?.additional_kwargs?.parsed != null) {
    try {
      return typeof msg.additional_kwargs.parsed === "string"
        ? msg.additional_kwargs.parsed
        : JSON.stringify(msg.additional_kwargs.parsed, null, 2);
    } catch {}
  }
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return extractTextFromContentArray(content);
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
};

const App = () => {
  const { exit } = useApp();
  const [inputValue, setInputValue] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    void ensureGeneratedDir();
  }, []);

  const appendLine = (line: string) => {
    setLines((prev) => [...prev, line]);
  };

  const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    setInputValue("");
    if (!trimmed) return;
    if (["exit", "quit", "q"].includes(trimmed.toLowerCase())) {
      exit();
      return;
    }
    appendLine(`You> ${trimmed}`);
    setIsProcessing(true);
    try {
      const result = await graph.invoke({
        messages: [new HumanMessage(trimmed)],
      });
      const last = result.messages[result.messages.length - 1] as any;
      const reasoning = extractReasoningText(last);
      if (reasoning) appendLine(`Reasoning> ${reasoning}`);
      const text = formatAssistantMessage(last);
      appendLine(`Agent> ${text}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      appendLine(`Error> ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return React.createElement(
    Box,
    { flexDirection: "column" },
    ...lines.map((line, idx) =>
      React.createElement(Text, { key: String(idx) }, line),
    ),
    isProcessing ? React.createElement(Text, null, "Processing...") : null,
    React.createElement(
      Box,
      null,
      React.createElement(Text, null, "You> "),
      React.createElement(TextInput, {
        value: inputValue,
        onChange: setInputValue,
        onSubmit: handleSubmit,
        focus: !isProcessing,
        placeholder: isProcessing ? "" : "Type a message, or 'exit' to quit",
      }),
    ),
  );
};

render(React.createElement(App));
