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
)

type (
	errMsg         string
	streamChunkMsg string
	streamDoneMsg  struct{}
)

type resultMsg struct {
	userInput string
	aiReply   string
}

const (
	ROOT_PADDING_X = 2
	ROOT_PADDING_Y = 1
)

var (
	// positive = lipgloss.AdaptiveColor{Light: "#059669", Dark: "#34D399"}
	// labelSt    = lipgloss.NewStyle().Foreground(positive)
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

	ch             <-chan string
	buf            strings.Builder
	busy           bool
	status         string
	detailedStatus string

	input    textinput.Model
	spin     spinner.Model
	viewport viewport.Model
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
		input:          ti,
		spin:           sp,
		viewport:       vp,
		buf:            strings.Builder{},
		status:         "",
		detailedStatus: "",
	}
}

func (m model) Init() tea.Cmd {
	return nil
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height

		m.viewport.Height = m.height - ROOT_PADDING_Y*2 - 7
		m.viewport.Width = m.width - ROOT_PADDING_X*2

		m.input.Width = max(m.width-(ROOT_PADDING_X*2)-2, 1)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {

		case "/exit", "ctrl+c":
			return m, tea.Quit

		case "esc":
			m.input.SetValue("")
			log.Println("Clicked: esc")
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
				m.viewport.SetContent("")
				return m, nil
			case "/models":
				// TODO:
				return m, nil
			}
			return m, tea.Batch(m.spin.Tick, m.invokeLLM(val))
		}

	case spinner.TickMsg:
		if m.busy {
			var cmd tea.Cmd
			m.spin, cmd = m.spin.Update(msg)
			return m, cmd
		}
		return m, nil

	case resultMsg:
		m.busy = false
		m.status = successSt.Render("Done!")
		return m, nil

	case errMsg:
		m.busy = false
		m.status = errorSt.Render("Done with error!")
		return m, nil

	case streamChunkMsg:
		m.detailedStatus = "Stream ongoing..."
		log.Println("Stream ongoing...")
		return m, waitForChunk(m.ch)

	case streamDoneMsg:
		m.detailedStatus = "Stream ended"
		return m, nil
	}

	var inputCmd, viewportCmd tea.Cmd
	m.input, inputCmd = m.input.Update(msg)
	m.viewport, viewportCmd = m.viewport.Update(msg)
	return m, tea.Batch(inputCmd, viewportCmd)
}

func (m model) View() string {
	maxContentWidth := max(m.width-(ROOT_PADDING_X*2)-2, 1)
	header := titleSt.Render("CLI Agent")
	busyLine := ""
	if m.busy {
		busyLine = fmt.Sprintf("%s  Processing...", m.spin.View())
	}
	inputField := inputBoxSt.Width(maxContentWidth).Render(m.input.View())
	controls := helpSt.Render("Esc: clear  -  /exit: quit  -  Enter: submit  -  \\ Enter: linebreaks")
	finalView := lipgloss.NewStyle().
		Padding(ROOT_PADDING_Y, ROOT_PADDING_X).
		Width(max(m.width, 1)).
		Height(max(m.height, 1)).
		Render(fmt.Sprintf("%s\n%s\n%s\n%s\n%s\n%s\n",
			header,
			m.viewport.View(),
			busyLine,
			m.status,
			inputField,
			controls,
		))
	return finalView
}

func (m model) invokeLLM(userInput string) tea.Cmd {
	ch := make(chan string)
	m.ch = ch
	m.busy = true
	m.status = "Streaming..."
	m.buf.Reset()
	m.viewport.SetContent("")

	log.Println("invoking llm...")

	return func() tea.Msg {
		go func() {
			defer close(ch)

			msgChunks := strings.SplitSeq(sampleLongMessage, " ")
			for chunk := range msgChunks {
				ch <- (chunk + " ")
				time.Sleep(time.Millisecond * 200)
			}
		}()

		return waitForChunk(ch)
	}
}

func waitForChunk(ch <-chan string) tea.Cmd {
	return func() tea.Msg {
		if s, ok := <-ch; ok {
			log.Println("streamChunkMsg(s)")
			return streamChunkMsg(s)
		}
		log.Println("streamDoneMsg{}")
		return streamDoneMsg{}
	}
}

func StartProgram() {
	p := tea.NewProgram(New())
	if _, err := p.Run(); err != nil {
		log.Println("Error:", err)
		os.Exit(1)
	}
}
