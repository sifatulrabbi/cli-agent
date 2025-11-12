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
	"github.com/sifatulrabbi/cli-agent/internals/agent"
)

type TuiModel struct {
	ti textarea.Model
	vp viewport.Model
	sp spinner.Model

	busy       bool
	busyStatus string
	logMessage string

	agentExecutor    *agent.AgentExecutor
	formattedHistory string

	escPressed bool

	maxWidth     int
	maxHeight    int
	inputHeight  int
	headerHeight int
	footerHeight int
	statusHeight int
}

func New() TuiModel {
	m := TuiModel{
		ti:           textarea.New(),
		vp:           viewport.New(1, 1),
		sp:           spinner.New(),
		maxWidth:     9,
		maxHeight:    9,
		inputHeight:  1,
		headerHeight: 1,
		footerHeight: 2,
		statusHeight: 2,
		busy:         false,
	}

	m.ti.ShowLineNumbers = false
	m.ti.Placeholder = "Enter your text"
	m.ti.Focus()
	m.ti.SetHeight(m.inputHeight)
	m.vp.MouseWheelEnabled = true
	m.sp.Spinner = spinner.Points

	m.agentExecutor = agent.New()

	return m
}

func (m TuiModel) Init() tea.Cmd {
	return nil
}

func (m TuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	cmds := []tea.Cmd{}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.maxWidth, m.maxHeight = msg.Width, msg.Height
		m.ti.SetWidth(m.maxWidth - 4)
		m.ti.SetHeight(m.inputHeight)
		m.updateHeights()
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit

		case "up", "down":
			return m, m.updateTextinput(msg)

		case "enter":
			if m.busy {
				return m, nil
			}

			v := strings.TrimSpace(m.ti.Value())
			switch v {
			case "":
				return m, nil

			case "/exit", "/quit":
				return m, tea.Quit

			case "/clear":
				m.ti.Reset()
				m.formattedHistory = ""
				m.updateHeights()
				return m, tea.Batch(m.updateTextinput(msg), m.updateViewport(msg))

			default:
				if strings.HasSuffix(v, "\\") {
					m.ti.SetValue(strings.TrimSuffix(v, "\\"))
					// Increasing the textinput's height when the user adds more lines.
					// While the max input field height would be 10 units.
					if m.inputHeight+1 < 10 {
						m.inputHeight += 1
					}
					m.updateHeights()
					return m, m.updateTextinput(msg)
				}
				return m, tea.Batch(m.handleSubmit(v), m.updateViewport(msg), m.updateTextinput(msg))
			}

		case "esc":
			if m.escPressed {
				m.ti.Reset()
				m.logMessage = ""
				m.escPressed = false
				m.busy = false
				m.busyStatus = ""
			} else if m.busy || m.ti.Value() != "" {
				m.escPressed = true
				if m.busy {
					m.logMessage = "Press Esc again to cancel the request."
				} else {
					m.logMessage = "Press Esc again to clear the input."
				}
			}
		}

	case spinner.TickMsg:
		// Only accepting the TickMsg when the CLI is busy
		if m.busy {
			sp, cmd := m.sp.Update(msg)
			cmds = append(cmds, cmd)
			m.sp = sp
		}
	}

	m.updateHeights()
	cmds = append(cmds, m.updateTextinput(msg), m.updateViewport(msg))
	return m, tea.Batch(cmds...)
}

// Updates heights for various TUI elements. Should be called once at the begining
// then whenever we feel like we need to adjust the element heights. e.g. After input,
// during streams, etc.
func (m *TuiModel) updateHeights() {
	// Right now the TUI may have both a busy status and a log message. e.g. Which todo the
	// model is currently handling can be a log message. Or if the agent fails and returns
	// an error message then we could show that in the log message. The height for the
	// log message + busy status message panel should be adjusted based on the need.
	if m.logMessage != "" && m.busyStatus != "" {
		m.statusHeight = 3
	} else if m.busyStatus != "" || m.logMessage != "" {
		m.statusHeight = 2
	} else {
		m.statusHeight = 0
	}

	m.ti.SetWidth(m.maxWidth - 4) // The '- 4' ensures padding of the x-axis.
	m.ti.SetHeight(m.inputHeight)

	// The viewport that display chat history gets the last remaining height of the TUI
	remainingHeight := m.maxHeight - m.inputHeight - m.headerHeight - m.footerHeight - m.statusHeight
	m.vp.Width = m.maxWidth
	m.vp.Height = remainingHeight
}

// Update the multi-line input's height accordingly then return a input update command
// of the text input package.
func (m *TuiModel) updateTextinput(msg tea.Msg) tea.Cmd {
	if m.busy {
		m.ti.Reset()
		m.ti.Blur()
	} else {
		m.ti.Focus()
	}

	var cmd tea.Cmd
	m.ti, cmd = m.ti.Update(msg) // Updates the text input's model with the message.

	// Ensuring the input size get's trimmed when there are lines with no content.
	if m.inputHeight > m.ti.LineCount() {
		m.inputHeight = m.ti.LineCount()
		m.ti.SetWidth(m.maxWidth - 4) // The '- 4' ensure the padding of the x-axis
		m.ti.SetHeight(m.inputHeight)
	}

	return cmd
}

// Update the viewport with the chat history content and scroll to the bottom if the user
// has not interrupted the auto scrolling behavior.
func (m *TuiModel) updateViewport(msg tea.Msg) tea.Cmd {
	var (
		cmd         tea.Cmd
		wasAtBottom = m.vp.AtBottom()
	)

	m.vp.SetContent(m.formattedHistory)
	m.vp.Style = m.vp.Style.Padding(1)
	m.vp, cmd = m.vp.Update(msg)

	// If the before update state is right at the bottom meaning the user never tried to
	// scroll up then it means we can scroll down on new content. Else we'd stay where the
	// UI is.
	if wasAtBottom {
		m.vp.GotoBottom()
	}

	return cmd
}

func (m *TuiModel) handleSubmit(userInput string) tea.Cmd {
	m.formattedHistory += fmt.Sprintf("USER: %s\n", userInput)
	m.busy = true
	m.busyStatus = "Processing…"
	m.updateHeights()

	cmds := []tea.Cmd{
		tea.Tick(
			m.sp.Spinner.FPS,
			func(time.Time) tea.Msg { return m.sp.Tick() },
		),
	}

	return tea.Batch(cmds...)
}

func (m TuiModel) View() string {
	finalView := strings.Builder{}
	finalView.WriteString(headerSt.Height(m.headerHeight).Render("CLI Agent"))
	finalView.WriteString("\n")
	finalView.WriteString(m.vp.View())
	finalView.WriteString("\n")

	if m.statusHeight > 0 {
		statusView := strings.Builder{}

		if m.busyStatus != "" {
			statusView.WriteString(m.sp.View())
			statusView.WriteString(" " + m.busyStatus)

			if m.logMessage != "" {
				statusView.WriteString("\n")
			}
		}

		if m.logMessage != "" {
			statusView.WriteString(m.logMessage)
		}

		finalView.WriteString(styled.Padding(0, 1).PaddingBottom(1).Height(m.statusHeight).Render(statusView.String()))
		finalView.WriteString("\n")
	}

	finalView.WriteString(m.ti.View())
	finalView.WriteString("\n")
	finalView.WriteString(footerSt.Height(m.footerHeight).Render("auto-accept mode on"))

	return finalView.String()
}

func StartProgram() {
	p := tea.NewProgram(New(), tea.WithMouseAllMotion())

	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}
