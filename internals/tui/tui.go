package tui

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type TuiModel struct {
	ti textarea.Model
	vp viewport.Model

	busy       bool
	busyStatus string
	logMessage string

	chatHistory string

	maxWidth     int
	maxHeight    int
	inputHeight  int
	headerHeight int
	footerHeight int
	statusHeight int
}

func (m TuiModel) Init() tea.Cmd {
	return nil
}

func (m TuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.maxWidth, m.maxHeight = msg.Width, msg.Height
		m.ti.SetWidth(m.maxWidth - 4)
		m.ti.SetHeight(m.inputHeight)
		m.updateViewportSize()
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "up", "down":
			return m, m.updateTextinput(msg)
		case "enter":
			v := strings.TrimSpace(m.ti.Value())
			switch v {
			case "":
				return m, nil
			case "/exit", "/quit":
				return m, tea.Quit
			case "/clear":
				m.ti.SetValue("")
				m.chatHistory = ""
				return m, tea.Batch(m.updateTextinput(msg), m.updateViewport(msg))
			default:
				if strings.HasSuffix(v, "\\") {
					m.ti.SetValue(strings.TrimSuffix(v, "\\"))
					// increasing the textinput's height when the user adds more lines.
					if m.inputHeight+1 < 10 {
						m.inputHeight += 1
					}
					return m, m.updateTextinput(msg)
				}
				return m, m.handleSubmit(v)
			}
		}
	}

	return m, tea.Batch(m.updateTextinput(msg), m.updateViewport(msg))
}

func (m *TuiModel) updateTextinput(msg tea.Msg) tea.Cmd {
	m.ti.SetWidth(m.maxWidth - 4)
	m.ti.SetHeight(m.inputHeight)

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

// This function calculates and updates the viewport's height based on the other
// components of the TUI.
func (m *TuiModel) updateViewportSize() {
	remainingHeight := m.maxHeight - m.inputHeight - m.headerHeight - m.footerHeight - m.statusHeight
	m.vp.Width = m.maxWidth
	m.vp.Height = remainingHeight
}

func (m *TuiModel) updateViewport(msg tea.Msg) tea.Cmd {
	var (
		cmd         tea.Cmd
		wasAtBottom = m.vp.AtBottom()
	)

	m.updateViewportSize()
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
	m.ti.SetValue("")
	m.busyStatus = "Processing…"
	return nil
}

func New() TuiModel {
	m := TuiModel{
		ti:           textarea.New(),
		vp:           viewport.New(1, 1),
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

	return m
}

func (m TuiModel) View() string {
	header := headerSt.Height(m.headerHeight).Render("CLI Agent")
	status := styled.Padding(0, 1).PaddingBottom(1).Height(m.statusHeight).Render(m.busyStatus)
	footer := footerSt.Height(m.footerHeight).Render("auto-accept mode on")
	return fmt.Sprintf(
		"%s\n%s\n%s\n%s\n%s",
		header,
		m.vp.View(),
		status,
		m.ti.View(),
		footer,
	)
}

func StartProgram() {
	p := tea.NewProgram(New(), tea.WithMouseAllMotion())
	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}
