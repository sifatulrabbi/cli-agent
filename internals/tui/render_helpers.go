package tui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"unicode"

	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"

	"github.com/sifatulrabbi/cli-agent/internals/agent"
	"github.com/sifatulrabbi/cli-agent/internals/agent/tools"
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
				b.WriteString("\n")
				plainReasoning := strings.ReplaceAll(aimsg.Reasoning, "\n\n", "\n")
				b.WriteString(mutedText.Width(width).Render(
					clipTopLines(wrapLines(plainReasoning, width), 4),
				))
				b.WriteString("\n")
			}

			if aimsg.Output != "" {
				b.WriteString(styledText(aimsg.Output, width))
				b.WriteString("\n")
			}

			for _, tc := range aimsg.ToolCalls {
				b.WriteString("\n")
				b.WriteString(wrapLines(italicText.Bold(true).Render("🔧 CLI-Agent is using tools:"), width))
				b.WriteString("\n")
				toolLine := ""
				if slices.Contains([]string{tools.ToolBash, tools.ToolGrep}, tc.Name) {
					var args struct {
						Cmd string `json:"cmd"`
					}
					cmdline := ""
					if err := json.Unmarshal([]byte(tc.Args), &args); err != nil {
						cmdline = "Invalid args from the AI!"
					} else {
						cmdline = strings.TrimSpace(args.Cmd)
					}
					toolLine = fmt.Sprintf("  ↳ %s → %s", tc.Name, cmdline)
				} else {
					toolLine = fmt.Sprintf("  ↳ %s", tc.Name)
				}
				b.WriteString(wrapLines(italicText.Render(toolLine), width))
				b.WriteString("\n")
			}
		}

		if msg.IsToolMsg() {
			tmsg := msg.ToToolMessage()
			b.WriteString(labelSt.Render(fmt.Sprintf("  » %s", tmsg.Name)))
			b.WriteString("\n")
			if strings.Contains(tmsg.Name, "todo") {
				todoList := agent.GetFormattedTodoList()
				// todoList = strings.Replace("<current_todo_list>")
				b.WriteString(lipgloss.NewStyle().Bold(true).Padding(2).Render(wrapLines(todoList, width-2*2)))
			} else {
				b.WriteString(mutedText.Italic(true).PaddingLeft(2).Render(clipBottomLines(wrapLines(tmsg.Content, width-2), 10)))
			}
			b.WriteString("\n")
		}
	}

	return b.String()
}

// Cached Glamour renderer so we don't re-init on every call.
var (
	mdRenderer     *glamour.TermRenderer
	mdRendererW    int
	mdRendererOnce sync.Mutex
)

func styledText(textToRender string, width int) string {
	if width < 1 {
		width = 30
	}

	// Lazily (re)create the renderer only when width or env-driven style changes matter.
	mdRendererOnce.Lock()
	if mdRenderer == nil || mdRendererW != width {
		opts := []glamour.TermRendererOption{
			glamour.WithWordWrap(width),
			glamour.WithAutoStyle(),
			glamour.WithEmoji(),
			glamour.WithStylesFromJSONBytes([]byte(`{"document":{"margin":0}}`)),
		}
		r, err := glamour.NewTermRenderer(opts...)
		if err == nil {
			mdRenderer = r
			mdRendererW = width
		} else {
			mdRenderer = nil
			mdRendererW = 0
		}
	}
	mdRendererOnce.Unlock()

	if mdRenderer == nil {
		return wrapLines(textToRender, width)
	}

	out, err := mdRenderer.Render(textToRender)
	if err != nil || out == "" {
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

func clipTopLines(content string, linesToKeep int) string {
	lines := strings.Split(content, "\n")
	l := len(lines)
	if l <= linesToKeep {
		return content
	}
	return fmt.Sprintf("...%d lines hidden\n%s",
		l-linesToKeep,
		strings.Join(lines[l-linesToKeep:], "\n"))
}

func clipBottomLines(content string, linesToKeep int) string {
	lines := strings.Split(content, "\n")
	l := len(lines)
	if l <= linesToKeep {
		return content
	}
	return fmt.Sprintf("%s\n...%d lines hidden",
		strings.Join(lines[:linesToKeep], "\n"),
		l-linesToKeep)
}

// extractActiveAtFragment finds the last '@' token in the given string and
// returns the fragment following it if, and only if, that token is the active
// one at the end of input (i.e., no whitespace after the '@').
func extractActiveAtFragment(s string) (string, bool) {
	if s == "" {
		return "", false
	}
	idx := strings.LastIndex(s, "@")
	if idx == -1 {
		return "", false
	}
	// Ensure there is no whitespace after '@' in the remainder — we only show
	// suggestions while the user is currently typing the path.
	tail := s[idx+1:]
	for _, r := range tail {
		if unicode.IsSpace(r) {
			return "", false
		}
	}
	// Also ensure the '@' is after the last whitespace, so we don't pick up a
	// completed token elsewhere in the input.
	lastWS := -1
	for i, r := range s {
		if unicode.IsSpace(r) {
			lastWS = i
		}
	}
	if idx <= lastWS {
		return "", false
	}
	return tail, true
}

// listPathSuggestions returns the immediate children of the directory denoted
// by base+frag (frag is a relative path typed after '@'), filtering by the
// final name prefix. Directories are suffixed with '/'.
func listPathSuggestions(base string, frag string) []string {
	// Determine directory part and name prefix
	dirPart := ""
	namePrefix := ""
	if frag == "" {
		dirPart = "."
		namePrefix = ""
	} else {
		cleaned := filepath.Clean(frag)
		// If frag ends with '/', user is browsing that directory
		if strings.HasSuffix(frag, "/") {
			dirPart = cleaned
			namePrefix = ""
		} else {
			dirPart = filepath.Dir(cleaned)
			if dirPart == "." {
				dirPart = ""
			}
			namePrefix = filepath.Base(cleaned)
			if namePrefix == "." || namePrefix == string(filepath.Separator) {
				namePrefix = ""
			}
		}
	}

	dirAbs := filepath.Join(base, dirPart)
	// Ensure dirAbs stays within base
	rel, err := filepath.Rel(base, dirAbs)
	if err != nil || strings.HasPrefix(rel, "..") {
		return nil
	}

	fi, err := os.Stat(dirAbs)
	if err != nil || !fi.IsDir() {
		return nil
	}

	entries, err := os.ReadDir(dirAbs)
	if err != nil {
		return nil
	}

	type item struct {
		name  string
		isDir bool
	}
	var items []item
	for _, e := range entries {
		n := e.Name()
		if namePrefix != "" && !strings.HasPrefix(n, namePrefix) {
			continue
		}
		items = append(items, item{name: n, isDir: e.IsDir()})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].isDir != items[j].isDir {
			return items[i].isDir // dirs first
		}
		return strings.ToLower(items[i].name) < strings.ToLower(items[j].name)
	})

	// Build display names and cap list size
	const maxItems = 50
	out := make([]string, 0, min(len(items), maxItems))
	for idx, it := range items {
		if idx >= maxItems {
			break
		}
		display := it.name
		if it.isDir {
			display += "/"
		}
		out = append(out, display)
	}
	return out
}

// renderSuggestions renders a vertical list (max 10 lines) of suggestions.
func renderSuggestions(width int, items []string, selected int, offset int) string {
	if len(items) == 0 {
		return ""
	}
	maxLines := 10
	total := len(items)
	if offset < 0 {
		offset = 0
	}
	if offset > total-1 {
		offset = max(0, total-1)
	}
	end := offset + maxLines
	if end > total {
		end = total
	}
	lines := make([]string, 0, end-offset)
	for i := offset; i < end; i++ {
		it := items[i]
		if i == selected {
			it = titleSt.Render("> " + it)
		} else {
			it = "  " + it
		}
		lines = append(lines, it)
	}
	content := strings.Join(lines, "\n")
	return helpSt.Width(width).Render(content)
}

// insertSuggestionIntoInput replaces the active '@fragment' at the end of the
// input with the chosen item, preserving any directory prefix typed so far.
func insertSuggestionIntoInput(raw string, frag string, chosen string) string {
	atIdx := strings.LastIndex(raw, "@")
	if atIdx == -1 {
		return raw
	}
	before := raw[:atIdx+1] // include '@'

	// Determine directory part from frag and rebuild with chosen
	dirPart := ""
	if frag != "" {
		cleaned := filepath.Clean(frag)
		if strings.HasSuffix(frag, "/") {
			dirPart = cleaned
		} else {
			dp := filepath.Dir(cleaned)
			if dp != "." {
				dirPart = dp
			} else {
				dirPart = ""
			}
		}
	}

	// Join dirPart with chosen (chosen may have trailing '/')
	var after string
	if dirPart == "" {
		after = chosen
	} else {
		// Ensure single separator
		if strings.HasSuffix(dirPart, "/") {
			after = dirPart + chosen
		} else {
			after = dirPart + "/" + chosen
		}
	}
	return before + after + " "
}
