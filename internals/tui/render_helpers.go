package tui

import (
	"fmt"
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/agent"
)

const DefaultTruncateLength = 200

// renderHistory builds the viewport content from the agent's full History.
func renderHistory(width int) string {
	var b strings.Builder
	for _, msg := range agent.History {
		switch {

		case msg.OfUser != nil:
			b.WriteString("\n")
			contentBuf := strings.Builder{}
			userInputArea := inputBoxSt.Width(width - 2)
			maxW := userInputArea.GetWidth() - 2 // because of the inner padding of the user message viewer
			if msg.OfUser.Content.OfString.Valid() {
				contentBuf.WriteString(wrapToWidth(msg.OfUser.Content.OfString.Value, maxW))
			} else if len(msg.OfUser.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfUser.Content.OfArrayOfContentParts {
					if txt := part.GetText(); txt != nil {
						contentBuf.WriteString(wrapToWidth(*txt, maxW))
					}
				}
			}
			b.WriteString(userInputArea.Padding(0, 1).Render(contentBuf.String()))
			b.WriteString("\n")

		case msg.OfAssistant != nil:
			b.WriteString(labelSt.Render("» AI"))
			b.WriteString("\n")

			if msg.OfAssistant.Content.OfString.Valid() {
				b.WriteString(wrapToWidth(msg.OfAssistant.Content.OfString.Value, width))
			} else if len(msg.OfAssistant.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfAssistant.Content.OfArrayOfContentParts {
					if txt := part.GetText(); txt != nil {
						b.WriteString(wrapToWidth(*txt, width))
					}
				}
			} else if msg.GetRefusal() != nil {
				b.WriteString(wrapToWidth(*msg.GetRefusal(), width))
			}

			// If the assistant requested any tool calls, render the requested tools list
			if len(msg.OfAssistant.ToolCalls) > 0 {
				b.WriteString("\n")
				b.WriteString(wrapToWidth(italicText.Render("🔧 Using tools:"), width))
				b.WriteString("\n")

				for _, tc := range msg.OfAssistant.ToolCalls {
					name := tc.GetFunction().Name
					args := mutedText.Render(tc.GetFunction().Arguments)
					if args != "" {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s args: %s", name, args)), width))
					} else {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s", name)), width))
					}
					b.WriteString("\n")
				}
			}
			b.WriteString("\n")

		case msg.OfTool != nil:
			b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s", msg.OfTool.ToolCallID)))
			b.WriteString("\n")

			toolContent := strings.Builder{}
			if msg.OfTool.Content.OfString.Valid() {
				toolContent.WriteString(msg.OfTool.Content.OfString.Value)
			} else if len(msg.OfTool.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfTool.Content.OfArrayOfContentParts {
					// Tool content parts are text-only in this union
					toolContent.WriteString(part.Text)
				}
			}

			b.WriteString(wrapToWidth(mutedText.Italic(true).Render(toolContent.String()), width))
			b.WriteString("\n")

		case msg.OfFunction != nil:
			b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s", msg.OfFunction.Name)))
			b.WriteString("\n")
			b.WriteString(wrapToWidth(mutedText.Italic(true).Render(msg.OfFunction.Content.Value), width))
			b.WriteString("\n")
		}
	}

	return b.String()
}

func renderHistoryNew(width int) string {
	var b strings.Builder

	for _, msg := range agent.HistoryNew {
		if msg.InputParams != nil {
			b.WriteString("\n")
			contentBuf := strings.Builder{}
			userInputArea := inputBoxSt.Width(width - 2)
			maxW := userInputArea.GetWidth() - 2 // because of the inner padding of the user message viewer
			if msg.InputParams.Input.OfString.Valid() {
				contentBuf.WriteString(wrapToWidth(msg.InputParams.Input.OfString.Value, maxW))
			}
			b.WriteString(userInputArea.Padding(0, 1).Render(contentBuf.String()))
			b.WriteString("\n")
		}

		if msg.Output != nil {
			b.WriteString(labelSt.Render("» AI"))
			b.WriteString("\n")

			for _, part := range msg.Output.Output {
				// Any of "message", "file_search_call", "function_call", "web_search_call",
				// "computer_call", "reasoning", "image_generation_call", "code_interpreter_call",
				// "local_shell_call", "mcp_call", "mcp_list_tools", "mcp_approval_request",
				// "custom_tool_call".
				switch part.Type {
				case "reasoning":
					r := part.AsReasoning()
					content := ""
					for _, c := range r.Content {
						content += c.Text
					}
					content += "\n"
					for _, c := range r.Summary {
						content += c.Text
					}
					b.WriteString(mutedText.Width(width).Render(wrapToWidth(content, width-2)))

				case "message":
					msg := part.AsMessage()
					content := ""
					for _, c := range msg.Content {
						content += c.Text
					}
					b.WriteString(wrapToWidth(content, width-2))

				case "function_call":
					fnCall := part.AsFunctionCall()
					args := mutedText.Render(fnCall.Arguments)
					if args != "" {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s args: %s", fnCall.Name, args)), width))
					} else {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s", fnCall.Name)), width))
					}
					b.WriteString("\n")

				case "custom_tool_call":
					customTool := part.AsCustomToolCall()
					args := mutedText.Render(customTool.Input)
					if args != "" {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s args: %s", customTool.Name, args)), width))
					} else {
						b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s", customTool.Name)), width))
					}
					b.WriteString("\n")
				}
			}

			b.WriteString("\n")
		}
	}

	// for _, msg := range agent.History {
	// 	switch {
	// 	case msg.OfTool != nil:
	// 		b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s", msg.OfTool.ToolCallID)))
	// 		b.WriteString("\n")
	//
	// 		toolContent := strings.Builder{}
	// 		if msg.OfTool.Content.OfString.Valid() {
	// 			toolContent.WriteString(msg.OfTool.Content.OfString.Value)
	// 		} else if len(msg.OfTool.Content.OfArrayOfContentParts) > 0 {
	// 			for _, part := range msg.OfTool.Content.OfArrayOfContentParts {
	// 				// Tool content parts are text-only in this union
	// 				toolContent.WriteString(part.Text)
	// 			}
	// 		}
	//
	// 		b.WriteString(wrapToWidth(mutedText.Italic(true).Render(toolContent.String()), width))
	// 		b.WriteString("\n")
	//
	// 	case msg.OfFunction != nil:
	// 		b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s", msg.OfFunction.Name)))
	// 		b.WriteString("\n")
	// 		b.WriteString(wrapToWidth(mutedText.Italic(true).Render(msg.OfFunction.Content.Value), width))
	// 		b.WriteString("\n")
	// 	}
	// }

	return b.String()
}

// wraps longer lines to fit into the viewport, this is a dirty line wrapper that works okay for English but will not work well for code
func wrapToWidth(s string, width int) string {
	if width < 30 {
		return "Please open the cli-agent in a large terminal with width of more than 30 columns."
	}

	var newLines []string = nil

	for line := range strings.SplitSeq(s, "\n") {
		if len(line) <= width {
			newLines = append(newLines, line)
			continue
		}

		buf := ""
		for word := range strings.SplitSeq(line, " ") {
			if len(buf+word+" ") > width {
				newLines = append(newLines, buf)
				buf = ""
			}
			buf += word + " "
		}
		if len(buf) > 0 {
			newLines = append(newLines, buf)
		}
	}

	return strings.Join(newLines, "\n")
}
