package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/glamour"

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
			contentBuf.WriteString(wrapLines(hmsg.Content, maxW))
			b.WriteString(userInputArea.Padding(0, 1).Render(contentBuf.String()))
			b.WriteString("\n")
		}

		if msg.IsAIMsg() {
			aimsg := msg.ToAIMessage()

			if aimsg.Reasoning != "" {
				b.WriteString(mutedText.Width(width).Render(wrapLines(aimsg.Reasoning, width)))
				b.WriteString("\n")
			}

			if aimsg.Output != "" {
				b.WriteString(styledText(aimsg.Output, width))
				b.WriteString("\n")
			}

			for _, tc := range aimsg.ToolCalls {
				args := mutedText.Render(tc.Args)

				b.WriteString("\n")
				b.WriteString(wrapLines(italicText.Render("🔧 Using tools:"), width))
				b.WriteString("\n")
				if args != "" {
					b.WriteString(wrapLines(italicText.Render(fmt.Sprintf("- %s args: %s", tc.Name, args)), width))
				} else {
					b.WriteString(wrapLines(italicText.Render(fmt.Sprintf("- %s", tc.Name)), width))
				}
				b.WriteString("\n")
			}
		}

		if msg.IsToolMsg() {
			tmsg := msg.ToToolMessage()
			b.WriteString(labelSt.Render(fmt.Sprintf("» TOOL: %s (%s)", tmsg.Name, tmsg.CallID)))
			b.WriteString("\n")
			b.WriteString(mutedText.Italic(true).Render(wrapLines(tmsg.Content, width)))
			b.WriteString("\n")
		}
	}

	return b.String()
}

func styledText(textToRender string, width int) string {
	r, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(width),
		glamour.WithStylePath("dark"),
	)
	out, err := r.Render(textToRender)
	if err != nil {
		return wrapLines(textToRender, width)
	}
	return out
}

func wrapLines(textToRender string, width int) string {
	if width < 30 {
		return "Please open the cli-agent in a large terminal with width of more than 30 columns."
	}

	var newLines []string = nil
	for line := range strings.SplitSeq(textToRender, "\n") {
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
