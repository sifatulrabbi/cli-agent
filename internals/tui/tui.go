package tui

import (
	"log"
	"os"

	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type TuiModel struct {
	ti textarea.Model
	vp viewport.Model

	maxWidth    int
	maxHeight   int
	inputHeight int
	busy        bool
}

func (m TuiModel) Init() tea.Cmd {
	return nil
}

func (m TuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.maxWidth, m.maxHeight = msg.Width, msg.Height

		m.ti.SetWidth(m.maxWidth - 4)
		m.ti.SetHeight(1)

		m.vp.Style.Width(m.maxWidth - 4)
		m.vp.Style.Height(m.maxHeight - 10)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "/exit", "ctrl+c":
			return m, tea.Quit
		}
	}

	var (
		cmds []tea.Cmd
		cmd  tea.Cmd
	)
	m.ti, cmd = m.ti.Update(msg)
	cmds = append(cmds, cmd)
	m.vp, cmd = m.vp.Update(msg)
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

func (m TuiModel) View() string {
	return m.vp.View() + "\n" + m.ti.View()
}

func New() TuiModel {
	m := TuiModel{
		ti:        textarea.New(),
		vp:        viewport.New(1, 1),
		maxWidth:  1,
		maxHeight: 1,
	}

	m.ti.ShowLineNumbers = false
	m.ti.Placeholder = "Enter your text"
	m.ti.Focus()

	m.vp.MouseWheelEnabled = true

	return m
}

func StartProgram() {
	p := tea.NewProgram(New(), tea.WithMouseAllMotion())
	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}
