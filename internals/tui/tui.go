package tui

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
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

	buf   strings.Builder
	input textinput.Model
	spin  spinner.Model
	vp    viewport.Model
}

func New() model {
	ti := textinput.New()
	ti.Prompt = "❯ "
	ti.Placeholder = getInputPlaceholder()
	ti.Focus() // focusing by default.

	vp := viewport.New(1, 1)
	vp.MouseWheelEnabled = true
	// Disable all keyboard scrolling/navigation in the viewport; allow mouse only.
	vp.KeyMap = viewport.KeyMap{}

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
	m.input.Placeholder = getInputPlaceholder()

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height

		m.vp.Height = m.height - ROOT_PADDING_Y*2 - 8
		m.vp.Width = max(m.width-ROOT_PADDING_X*2, 1)

		m.input.Width = max(m.width-ROOT_PADDING_X*2-3*2-2, 1)

		log.Printf("Max width: %d, input width: %d, viewport width: %d\n", m.width, m.input.Width, m.vp.Width)
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

			m.busy = true
			m.ch = agent.ChatWithLLM(val)
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
		return m, func() tea.Msg { return InfoMsg("Successfully generated reply from the LLM!") }
	}

	var inputCmd, viewportCmd tea.Cmd
	m.input, inputCmd = m.input.Update(msg)
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
	controls := helpSt.Render(fmt.Sprintf("Enter: submit  •  /exit: quit  •  /clear: clear history  •  Linebreaks are not supported yet  •  Model: %s",
		agent.Model.String()))
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
