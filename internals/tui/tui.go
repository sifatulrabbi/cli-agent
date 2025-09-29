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
)

type TuiModel struct {
	ti textarea.Model
	vp viewport.Model
	sp spinner.Model

	busy       bool
	busyStatus string
	logMessage string

	chatHistory string

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
				m.chatHistory = ""
				m.updateHeights()
				return m, tea.Batch(m.updateTextinput(msg), m.updateViewport(msg))

			default:
				if strings.HasSuffix(v, "\\") {
					m.ti.SetValue(strings.TrimSuffix(v, "\\"))
					// increasing the textinput's height when the user adds more lines.
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
					m.logMessage = "Press Esc again to cancel the process."
				} else {
					m.logMessage = "Press Esc again to clear the input."
				}
			}
		}

	case spinner.TickMsg:
		// only accepting the TickMsg when the CLI is busy
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

func (m *TuiModel) updateHeights() {
	if m.logMessage != "" && m.busyStatus != "" {
		m.statusHeight = 3
	} else if m.busyStatus != "" || m.logMessage != "" {
		m.statusHeight = 2
	} else {
		m.statusHeight = 0
	}

	m.ti.SetWidth(m.maxWidth - 4)
	m.ti.SetHeight(m.inputHeight)

	// This function calculates and updates the viewport's height based on the other
	// components of the TUI.
	remainingHeight := m.maxHeight - m.inputHeight - m.headerHeight - m.footerHeight - m.statusHeight
	m.vp.Width = m.maxWidth
	m.vp.Height = remainingHeight
}

func (m *TuiModel) updateTextinput(msg tea.Msg) tea.Cmd {
	if m.busy {
		m.ti.Reset()
		m.ti.Blur()
	} else {
		m.ti.Focus()
	}

	var cmd tea.Cmd
	m.ti, cmd = m.ti.Update(msg)

	// ensuring the input size get's trimmed when there are lines with no content.
	if m.inputHeight > m.ti.LineCount() {
		m.inputHeight = m.ti.LineCount()
		m.ti.SetWidth(m.maxWidth - 4)
		m.ti.SetHeight(m.inputHeight)
	}

	return cmd
}

func (m *TuiModel) updateViewport(msg tea.Msg) tea.Cmd {
	var (
		cmd         tea.Cmd
		wasAtBottom = m.vp.AtBottom()
	)

	m.vp.SetContent(m.chatHistory)
	m.vp.Style = m.vp.Style.Padding(1)
	m.vp, cmd = m.vp.Update(msg)

	if wasAtBottom {
		m.vp.GotoBottom()
	}

	return cmd
}

func (m *TuiModel) handleSubmit(userInput string) tea.Cmd {
	m.chatHistory += fmt.Sprintf("USER: %s\n", userInput)
	m.busy = true
	m.busyStatus = "Processing…"
	m.updateHeights()
	return tea.Tick(m.sp.Spinner.FPS, func(time.Time) tea.Msg { return m.sp.Tick() })
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
