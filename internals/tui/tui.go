package tui

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/openai/openai-go/v2"

	"github.com/sifatulrabbi/tea-play/internals/agent"
)

type (
	ErrMsg         string
	InfoMsg        string
	streamChunkMsg string
	streamDoneMsg  struct{}
)

const (
	ROOT_PADDING_X = 2
	ROOT_PADDING_Y = 1
)

var (
	positive   = lipgloss.AdaptiveColor{Light: "#059669", Dark: "#34D399"}
	labelSt    = lipgloss.NewStyle().Foreground(positive)
	accent     = lipgloss.AdaptiveColor{Light: "#2D5BFF", Dark: "#7AA2F7"}
	subtle     = lipgloss.AdaptiveColor{Light: "#6B7280", Dark: "#9CA3AF"}
	titleSt    = lipgloss.NewStyle().Bold(true).Foreground(accent).Bold(true)
	helpSt     = lipgloss.NewStyle().Foreground(subtle)
	inputBoxSt = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(accent) //.Margin(1, 1)
	errorSt    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ef4444"))
	successSt  = lipgloss.NewStyle().Foreground(lipgloss.Color("#22c55e"))
)

type model struct {
	height int
	width  int

	ch <-chan string

	busy       bool
	busyStatus string
	status     string

	buf   strings.Builder
	input textinput.Model
	spin  spinner.Model
	vp    viewport.Model
}

func New() model {
	ti := textinput.New()
	ti.Prompt = "❯ "
	ti.Placeholder = "Type a label and press enter"
	ti.Focus() // focusing by default.

	vp := viewport.New(1, 1)
	vp.MouseWheelEnabled = true

	sp := spinner.New()
	sp.Spinner = spinner.Dot

	return model{
		busy:       false,
		busyStatus: "",
		status:     "",
		buf:        strings.Builder{},
		input:      ti,
		spin:       sp,
		vp:         vp,
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height

		m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8
		m.vp.Width = max(m.width-ROOT_PADDING_X*2, 80)

		m.input.Width = max(m.width-(ROOT_PADDING_X*2)-2, 1)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {

		case "/exit", "ctrl+c":
			return m, tea.Quit

		case "esc":
			m.input.SetValue("")
			return m, nil

		case "enter":
			if m.busy {
				return m, nil
			}

			val := strings.TrimSpace(m.input.Value())
			if string(val[len(val)-1]) == "\\" {
				m.input.SetValue(string(val[:len(val)-1]) + "\n")
				return m, nil
			}
			m.input.Reset()
			switch val {
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

			// Append the user message to history immediately so it renders right away
			agent.History = append(agent.History, openai.UserMessage(val))

            ch := agent.ChatWithLLM(val)
            m.ch = ch
            m.busy = true
            m.busyStatus = "Processing…"
            // Render the entire history; agent will send update signals as it streams
            m.vp.SetContent(renderHistory())
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
		m.busy = false
		m.status = successSt.Render(string(msg))
		return m, nil

	case ErrMsg:
		m.busy = false
		m.status = errorSt.Render(string(msg))
		return m, nil

	case streamChunkMsg:
		m.busyStatus = "Generating…"
		isAtBottom := m.vp.AtBottom()
		// Re-render the full history (agent updates History incrementally)
		m.vp.SetContent(renderHistory())
		if isAtBottom {
			m.vp.GotoBottom()
		}
		return m, m.waitForChunk()

	case streamDoneMsg:
		isAtBottom := m.vp.AtBottom()
		// After stream completes, History already holds the final assistant message
		m.vp.SetContent(renderHistory())
		if isAtBottom {
			m.vp.GotoBottom()
		}
		m.busy = false
		m.busyStatus = ""
		return m, func() tea.Msg { return InfoMsg("Successfully generated reply from the LLM!") }
	}

	var inputCmd, viewportCmd tea.Cmd
	m.input, inputCmd = m.input.Update(msg)
	m.vp, viewportCmd = m.vp.Update(msg)
	return m, tea.Batch(inputCmd, viewportCmd)
}

func (m model) View() string {
	maxContentWidth := max(m.width-(ROOT_PADDING_X*2)-2, 1)
	header := titleSt.Render("CLI Agent")
	busyLine := ""
	if m.busy {
		busyLine = fmt.Sprintf("%s%s", m.spin.View(), m.busyStatus)
	}
	inputField := inputBoxSt.Width(maxContentWidth).Render(m.input.View())
	controls := helpSt.Render("Enter: submit  •  /exit: quit  •  Esc: clear  •  Linebreaks are not supported")
	finalView := lipgloss.NewStyle().
		Padding(ROOT_PADDING_Y, ROOT_PADDING_X).
		Width(max(m.width, 1)).
		Height(max(m.height, 1)).
		Render(fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s\n",
			header,
			m.vp.View(),
			busyLine,
			m.status,
			inputField,
			controls,
		))
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

// renderHistory builds the viewport content from the agent's full History.
func renderHistory() string {
	var b strings.Builder
	for _, msg := range agent.History {
		switch {
		case msg.OfUser != nil:
			// Label
			b.WriteString(labelSt.Render("» USER"))
			b.WriteString("\n")
			// Content can be plain string or an array of content parts
			if msg.OfUser.Content.OfString.Valid() {
				b.WriteString(msg.OfUser.Content.OfString.Value)
			} else if len(msg.OfUser.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfUser.Content.OfArrayOfContentParts {
					if txt := part.GetText(); txt != nil {
						b.WriteString(*txt)
					}
				}
			}
			b.WriteString("\n\n")

		case msg.OfAssistant != nil:
			b.WriteString(labelSt.Render("» AI"))
			b.WriteString("\n")
			if msg.OfAssistant.Content.OfString.Valid() {
				b.WriteString(msg.OfAssistant.Content.OfString.Value)
			} else if len(msg.OfAssistant.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfAssistant.Content.OfArrayOfContentParts {
					if txt := part.GetText(); txt != nil {
						b.WriteString(*txt)
					}
				}
			} else if msg.GetRefusal() != nil {
				b.WriteString(*msg.GetRefusal())
			}
			b.WriteString("\n\n")

		case msg.OfTool != nil:
			b.WriteString(labelSt.Render("» TOOL"))
			b.WriteString("\n")
			if msg.OfTool.Content.OfString.Valid() {
				b.WriteString(msg.OfTool.Content.OfString.Value)
			} else if len(msg.OfTool.Content.OfArrayOfContentParts) > 0 {
				for _, part := range msg.OfTool.Content.OfArrayOfContentParts {
					// Tool content parts are text-only in this union
					b.WriteString(part.Text)
				}
			}
			b.WriteString("\n\n")
		}
	}
	return b.String()
}

func StartProgram() {
	p := tea.NewProgram(New())
	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}
