package tui

import (
	"fmt"
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/agent"
)

const DefaultTruncateLength = 200

func renderHistory(width int) string {
	var b strings.Builder

	for _, msg := range agent.History {
		if msg.IsHumanMsg() {
			hmsg := msg.ToHumanMessage()
			b.WriteString("\n")
			contentBuf := strings.Builder{}
			userInputArea := inputBoxSt.Width(width - 2)
			maxW := userInputArea.GetWidth() - 2
			contentBuf.WriteString(wrapToWidth(hmsg.Content, maxW))
			b.WriteString(userInputArea.Padding(0, 1).Render(contentBuf.String()))
			b.WriteString("\n")
		}

		if msg.IsAIMsg() {
			aimsg := msg.ToAIMessage()

			if aimsg.Reasoning != "" {
				b.WriteString(mutedText.Width(width).Render(wrapToWidth(aimsg.Reasoning, width)))
				b.WriteString("\n")
			}

			if aimsg.Output != "" {
				b.WriteString(wrapToWidth(aimsg.Output, width))
				b.WriteString("\n")
			}

			for _, tc := range aimsg.ToolCalls {
				args := mutedText.Render(tc.Args)

				b.WriteString("\n")
				b.WriteString(wrapToWidth(italicText.Render("🔧 Using tools:"), width))
				b.WriteString("\n")
				if args != "" {
					b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s args: %s", tc.Name, args)), width))
				} else {
					b.WriteString(wrapToWidth(italicText.Render(fmt.Sprintf("- %s", tc.Name)), width))
				}
				b.WriteString("\n")
			}
		}

		if msg.IsToolMsg() {
			tmsg := msg.ToToolMessage()
			b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s (%s)", tmsg.Name, tmsg.CallID)))
			b.WriteString("\n")
			b.WriteString(wrapToWidth(mutedText.Italic(true).Render(tmsg.Content), width))
			b.WriteString("\n")
		}
	}

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
