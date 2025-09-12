package tui

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/sifatulrabbi/cli-agent/internals/agent"
	"github.com/sifatulrabbi/cli-agent/internals/configs"
	"github.com/sifatulrabbi/cli-agent/internals/utils"
)

type (
	ErrMsg         string
	InfoMsg        string
	streamChunkMsg string
	streamDoneMsg  struct{}
	ClearStatusMsg struct{}
)

const (
	ROOT_PADDING_X = 2
	ROOT_PADDING_Y = 1
)

type model struct {
	height int
	width  int

	ch <-chan string

	busy       bool
	busyStatus string
	status     string

	buf          strings.Builder
	input        textarea.Model
	spin         spinner.Model
	vp           viewport.Model
	inputMaxRows int

	// file path suggestions when typing '@'
	showSuggestions      bool
	suggestions          []string
	selectedSuggestionIx int
	suggestionsOffset    int
}

func New() model {
	ti := textarea.New()
	ti.Placeholder = getInputPlaceholder()
	ti.Focus() // focusing by default.
	ti.SetHeight(1)
	ti.ShowLineNumbers = false

	vp := viewport.New(1, 1)
	vp.MouseWheelEnabled = true
	// Disable all keyboard scrolling/navigation in the viewport; allow mouse only.
	vp.KeyMap = viewport.KeyMap{}

	sp := spinner.New()
	sp.Spinner = spinner.Dot

	return model{
		busy:              false,
		busyStatus:        "",
		status:            "",
		buf:               strings.Builder{},
		input:             ti,
		spin:              sp,
		vp:                vp,
		inputMaxRows:      10,
		suggestionsOffset: 0,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	m.input.Placeholder = getInputPlaceholder()

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height

		m.vp.Width = max(m.width-ROOT_PADDING_X*2, 1)
		// Input width stays within the bordered box, leave room for padding/border
		m.input.SetWidth(max(m.width-ROOT_PADDING_X*2-3*2-2, 1))
		// Adjust viewport height based on current input rows (cap at 10)
		visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
		if visibleRows < 1 {
			visibleRows = 1
		}
		m.input.SetHeight(visibleRows)
		suggLines := 0
		if m.showSuggestions {
			if l := len(m.suggestions); l > 0 {
				if l > 10 {
					suggLines = 10
				} else {
					suggLines = l
				}
			}
		}
		todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
		m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines

		log.Printf("Max width: %d, viewport width: %d\n", m.width, m.vp.Width)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {

		case "/exit", "ctrl+c":
			return m, tea.Quit

		case "esc":
			m.input.SetValue("")
			return m, nil

		case "ctrl+j":
			// Insert a newline at the cursor and resize up to max height.
			m.input.InsertString("\n")
			visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
			if visibleRows < 1 {
				visibleRows = 1
			}
			m.input.SetHeight(visibleRows)
			suggLines := 0
			if m.showSuggestions {
				if l := len(m.suggestions); l > 0 {
					if l > 10 {
						suggLines = 10
					} else {
						suggLines = l
					}
				}
			}
			todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
			m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines
			return m, nil

		case "up":
			if m.showSuggestions && len(m.suggestions) > 0 {
				if m.selectedSuggestionIx > 0 {
					m.selectedSuggestionIx--
				} else {
					m.selectedSuggestionIx = len(m.suggestions) - 1
				}
				// adjust offset to keep selection visible
				if m.selectedSuggestionIx < m.suggestionsOffset {
					m.suggestionsOffset = m.selectedSuggestionIx
				}
				return m, nil
			}
			// Otherwise let textarea handle up arrow

		case "down":
			if m.showSuggestions && len(m.suggestions) > 0 {
				m.selectedSuggestionIx = (m.selectedSuggestionIx + 1) % len(m.suggestions)
				maxLines := 10
				if m.selectedSuggestionIx >= m.suggestionsOffset+maxLines {
					m.suggestionsOffset = m.selectedSuggestionIx - maxLines + 1
				}
				return m, nil
			}
			// Otherwise let textarea handle down arrow

		case "left":
			if m.showSuggestions && len(m.suggestions) > 0 {
				if m.selectedSuggestionIx > 0 {
					m.selectedSuggestionIx--
				} else {
					m.selectedSuggestionIx = len(m.suggestions) - 1
				}
				if m.selectedSuggestionIx < m.suggestionsOffset {
					m.suggestionsOffset = m.selectedSuggestionIx
				}
				return m, nil
			}
			// Otherwise let textarea handle left arrow

		case "right":
			if m.showSuggestions && len(m.suggestions) > 0 {
				m.selectedSuggestionIx = (m.selectedSuggestionIx + 1) % len(m.suggestions)
				maxLines := 10
				if m.selectedSuggestionIx >= m.suggestionsOffset+maxLines {
					m.suggestionsOffset = m.selectedSuggestionIx - maxLines + 1
				}
				return m, nil
			}
			// Otherwise let textarea handle right arrow

		case "enter":
			// If suggestions are visible, accept selection instead of submitting
			if m.showSuggestions && len(m.suggestions) > 0 {
				frag, ok := extractActiveAtFragment(m.input.Value())
				if ok {
					chosen := m.suggestions[m.selectedSuggestionIx]
					newVal := insertSuggestionIntoInput(m.input.Value(), frag, chosen)
					m.input.SetValue(newVal)
					if strings.HasSuffix(chosen, "/") {
						// Keep browsing into directory: refresh suggestions
						m.refreshSuggestions()
					} else {
						// Hide suggestions after selecting a file
						m.showSuggestions = false
						m.suggestions = nil
						m.selectedSuggestionIx = 0
						m.suggestionsOffset = 0
					}
					// Adjust input/viewport heights after modification
					visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
					if visibleRows < 1 {
						visibleRows = 1
					}
					m.input.SetHeight(visibleRows)
					suggLines := 0
					if m.showSuggestions {
						if l := len(m.suggestions); l > 0 {
							if l > 10 {
								suggLines = 10
							} else {
								suggLines = l
							}
						}
					}
					todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
					m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines
					return m, nil
				}
			}
			if m.busy {
				return m, nil
			}

			raw := m.input.Value()
			if strings.TrimSpace(raw) == "" {
				return m, nil
			}
			// Clear input, reset height to 1
			m.input.SetValue("")
			m.input.SetHeight(1)
			// Recompute viewport height after clearing input
			todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
			m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - todoLines

			switch strings.TrimSpace(raw) {
			case "/exit":
				return m, tea.Quit
			case "/clear":
				m.buf.Reset()
				// Clear the in-memory conversation history as well
				agent.History = agent.History[:0]
				m.vp.SetContent("")
				return m, nil
			case "/models":
				// TODO:
				return m, nil
			}

			m.busy = true
			m.ch = agent.ChatWithLLM(raw)
			m.busyStatus = "Processing…"
			m.vp.SetContent(renderHistory(m.vp.Width))
			m.vp.GotoBottom()

			return m, tea.Batch(m.spin.Tick, m.waitForChunk())
		}

	case spinner.TickMsg:
		if m.busy {
			var cmd tea.Cmd
			m.spin, cmd = m.spin.Update(msg)
			return m, cmd
		}
		return m, nil

	case InfoMsg:
		m.status = successSt.Render(string(msg))
		return m, clearMsgTick()

	case ErrMsg:
		m.status = errorSt.Render(string(msg))
		return m, clearMsgTick()

	case ClearStatusMsg:
		m.status = ""
		return m, nil

	case streamChunkMsg:
		m.busyStatus = "Thinking…"
		m.busy = true
		isAtBottom := m.vp.AtBottom()
		// Re-render the full history (agent updates History incrementally)
		m.vp.SetContent(renderHistory(m.vp.Width))
		if isAtBottom {
			m.vp.GotoBottom()
		}
		// Update viewport height in case todos changed via tool calls
		visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
		if visibleRows < 1 {
			visibleRows = 1
		}
		suggLines := 0
		if m.showSuggestions {
			if l := len(m.suggestions); l > 0 {
				if l > 10 {
					suggLines = 10
				} else {
					suggLines = l
				}
			}
		}
		todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
		m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines
		return m, m.waitForChunk()

	case streamDoneMsg:
		isAtBottom := m.vp.AtBottom()
		// After stream completes, History already holds the final assistant message
		m.vp.SetContent(renderHistory(m.vp.Width))
		if isAtBottom {
			m.vp.GotoBottom()
		}
		m.busy = false
		m.busyStatus = ""
		// Final adjust in case tools modified todo list
		visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
		if visibleRows < 1 {
			visibleRows = 1
		}
		suggLines := 0
		if m.showSuggestions {
			if l := len(m.suggestions); l > 0 {
				if l > 10 {
					suggLines = 10
				} else {
					suggLines = l
				}
			}
		}
		todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
		m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines
		return m, func() tea.Msg { return InfoMsg("Successfully generated reply from the LLM!") }
	}

	var inputCmd, viewportCmd tea.Cmd
	m.input, inputCmd = m.input.Update(msg)
	// Refresh file suggestions whenever input changes
	m.refreshSuggestions()
	// Keep input height responsive to content changes (cap at 10)
	visibleRows := min(m.inputMaxRows, countLines(m.input.Value()))
	if visibleRows < 1 {
		visibleRows = 1
	}
	m.input.SetHeight(visibleRows)
	suggLines := 0
	if m.showSuggestions {
		if l := len(m.suggestions); l > 0 {
			if l > 10 {
				suggLines = 10
			} else {
				suggLines = l
			}
		}
	}
	todoLines := currentTodoLines(max(m.width-(ROOT_PADDING_X*2)-2, 1))
	m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8 - (visibleRows - 1) - suggLines - todoLines
	m.vp, viewportCmd = m.vp.Update(msg)
	return m, tea.Batch(inputCmd, viewportCmd)
}

func (m model) View() string {
	maxContentWidth := max(m.width-(ROOT_PADDING_X*2)-2, 1)
	header := titleSt.Render("CLI Agent  ")
	header += mutedText.Render(configs.WorkingPath)
	busyLine := ""
	if m.busy {
		busyLine = fmt.Sprintf("%s%s", m.spin.View(), m.busyStatus)
	}
	inputField := inputBoxSt.Width(maxContentWidth).Render(m.input.View())
	controls := helpSt.Render(fmt.Sprintf("Enter: submit • Ctrl+J: new line • /exit: quit • /clear: clear history • Model: %s",
		agent.Model.String()))

	var lines []string
	lines = append(lines, header)
	lines = append(lines, m.vp.View())
	lines = append(lines, busyLine)
	lines = append(lines, m.status)
	// Render todo list (if any) above the input field
	if todo := renderTodoPanel(maxContentWidth); todo != "" {
		lines = append(lines, todo)
	}
	lines = append(lines, inputField)
	if m.showSuggestions && len(m.suggestions) > 0 {
		lines = append(lines, renderSuggestions(maxContentWidth, m.suggestions, m.selectedSuggestionIx, m.suggestionsOffset))
	}
	lines = append(lines, controls)

	finalView := lipgloss.NewStyle().
		Padding(ROOT_PADDING_Y, ROOT_PADDING_X).
		Width(max(m.width, 1)).
		Height(max(m.height, 1)).
		Render(strings.Join(lines, "\n") + "\n")
	return finalView
}

func (m model) waitForChunk() tea.Cmd {
	return func() tea.Msg {
		if s, ok := <-m.ch; ok {
			return streamChunkMsg(s)
		}
		return streamDoneMsg{}
	}
}

func clearMsgTick() tea.Cmd {
	return tea.Tick(5*time.Second, func(time.Time) tea.Msg {
		return ClearStatusMsg{}
	})
}

func getInputPlaceholder() string {
	return utils.Ternary(len(agent.History) == 0, "Enter your message", "Write a follow up")
}

func StartProgram() {
	p := tea.NewProgram(New(), tea.WithMouseAllMotion())
	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}

func countLines(s string) int {
	if s == "" {
		return 1
	}
	return strings.Count(s, "\n") + 1
}

// currentTodoLines returns how many visual lines the todo panel will take
// for the given content width, so we can subtract it from the viewport height.
func currentTodoLines(width int) int {
	if width < 1 {
		return 0
	}
	todo := agent.GetFormattedTodoList()
	if strings.TrimSpace(todo) == "" {
		return 0
	}
	body := wrapLines(todo, width)
	bodyLines := countLines(body)
	return bodyLines
}

// renderTodoPanel renders the todo list above the input field when non-empty.
func renderTodoPanel(width int) string {
	todo := agent.GetFormattedTodoList()
	if strings.TrimSpace(todo) == "" {
		return ""
	}
	body := wrapLines(todo, width)
	return body
}

// refreshSuggestions updates the in-model file suggestions based on the last
// "@path" fragment in the input, only if the fragment is at the end of input.
func (m *model) refreshSuggestions() {
	raw := m.input.Value()
	frag, ok := extractActiveAtFragment(raw)
	if !ok {
		m.showSuggestions = false
		m.suggestions = nil
		m.selectedSuggestionIx = 0
		m.suggestionsOffset = 0
		return
	}

	// Build suggestions relative to WorkingPath
	sugg := listPathSuggestions(configs.WorkingPath, frag)
	if len(sugg) == 0 {
		m.showSuggestions = false
		m.suggestions = nil
		m.selectedSuggestionIx = 0
		m.suggestionsOffset = 0
		return
	}
	m.showSuggestions = true
	m.suggestions = sugg
	if m.selectedSuggestionIx >= len(m.suggestions) {
		m.selectedSuggestionIx = max(0, len(m.suggestions)-1)
	}
	// Clamp offset and keep selection visible
	maxLines := 10
	maxOffset := max(0, len(m.suggestions)-maxLines)
	if m.suggestionsOffset > maxOffset {
		m.suggestionsOffset = maxOffset
	}
	if m.selectedSuggestionIx < m.suggestionsOffset {
		m.suggestionsOffset = m.selectedSuggestionIx
	}
	if m.selectedSuggestionIx >= m.suggestionsOffset+maxLines {
		m.suggestionsOffset = m.selectedSuggestionIx - maxLines + 1
	}
}
