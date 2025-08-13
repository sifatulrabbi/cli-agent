import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { render, Box, Text, useStdout } from "ink";

const messages: (AIMessage | HumanMessage)[] = [
  new HumanMessage("Hello, how are you?"),
  new AIMessage("I'm doing well, thank you!"),
  new HumanMessage("What is the weather in Tokyo?"),
  new AIMessage({
    content: "",
    tool_calls: [
      {
        id: "tool_dfad2332fda234fswe234234",
        name: "get_weather",
        args: { city: "Tokyo" },
      },
    ],
  }),
  new ToolMessage({
    content: "The weather in Tokyo is sunny.",
    tool_call_id: "tool_dfad2332fda234fswe234234",
  }),
  new AIMessage("The weather in Tokyo is sunny."),
];

function Divider() {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;
  return <Text color="blue">{"─".repeat(width)}</Text>;
}

function MessageItem({ message }: { message: BaseMessage }) {
  const label = message.getType() === "human" ? "You> " : "Agent> ";
  const textColor = message.getType() === "tool" ? "gray" : undefined;

  let content = "";
  if ("content" in message && typeof message.content === "string") {
    content = message.content;
  } else if ("content" in message && Array.isArray(message.content)) {
    // Some messages may have content as an array of message parts
    content = message.content
      .map((c) => (typeof c === "string" ? c : (c as any)?.text ?? ""))
      .join("");
  } else if (
    "content" in message &&
    typeof message.content === "object" &&
    message.content !== null
  ) {
    // For AIMessage with tool_calls or ToolMessage with content as object
    if (
      "tool_calls" in message.content &&
      Array.isArray(message.content.tool_calls)
    ) {
      // Show tool call names and args
      content = message.content.tool_calls
        .map(
          (tc: any) =>
            `[tool call] ${tc.name}(${JSON.stringify(tc.args ?? {})})`,
        )
        .join("\n");
    } else if (
      "tool_call_id" in message.content &&
      "content" in message.content
    ) {
      // ToolMessage with tool_call_id and content
      content = `[tool response] ${message.content.content}`;
    }
  }

  return (
    <Box marginBottom={1}>
      <Text>
        <Text color="blue">{label}</Text>
        <Text color={textColor}>{content}</Text>
      </Text>
    </Box>
  );
}

function App() {
  return (
    <Box flexDirection="column">
      <Text color="blue">Chat</Text>
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <MessageItem key={i} message={msg} />
        ))}
      </Box>
      <Divider />
    </Box>
  );
}

render(<App />);
