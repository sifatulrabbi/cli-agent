// Package agent
package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log"
	"os"
	"os/exec"
)

type StreamSig = string

const (
	MsgTypeAI   = "ai"
	MsgTypeUser = "user"
	MsgTypeTool = "tool"

	EventTypeDelta = "delta"
	EventTypeStart = "start"
	EventTypeEnd   = "end"

	SigStart StreamSig = "sig:start"
	SigDelta StreamSig = "sig:delta"
	SigEnd   StreamSig = "sig:end"
)

type ToolCall struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Args string `json:"args"`
}

type Message struct {
	ID        string     `json:"id"`
	Type      string     `json:"type"` // ai | user | tool
	Reasoning string     `json:"reasoning"`
	Content   string     `json:"content"`
	ToolCalls []ToolCall `json:"toolCalls"` // only available when the type === ai
}

type Event struct {
	Event   string    `json:"event"` // "delta" | "end" | "start";
	History []Message `json:"history"`
}

type AgentExecutor struct {
	ProgramPath string
	Stdin       io.Writer
	Stdout      io.Reader
	Stderr      io.Reader

	Busy    bool
	Error   error
	History []Message

	StopProcess func()
}

func New() *AgentExecutor {
	a := AgentExecutor{}
	a.ProgramPath = "./agent/src/runner.ts"

	_, err := os.Open(a.ProgramPath)
	if err != nil {
		log.Fatalln("Error locating agent executor program!", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.StopProcess = cancel

	cmd := exec.CommandContext(ctx, "bun", a.ProgramPath)

	if a.Stdin, err = cmd.StdinPipe(); err != nil {
		log.Fatalln("Unable to pipe the stdin:", err)
	}
	if a.Stdout, err = cmd.StdoutPipe(); err != nil {
		log.Fatalln("Unable to pipe the stdout:", err)
	}
	if a.Stderr, err = cmd.StderrPipe(); err != nil {
		log.Fatalln("Unable to pipe the stderr:", err)
	}

	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	if err := cmd.Start(); err != nil {
		log.Fatalf("Failed to start agent program: %v", err)
	}

	return &a
}

func (a *AgentExecutor) Invoke(userInput string) <-chan string {
	a.Busy = true
	c := make(chan string)

	go func() {
		reader := bufio.NewReader(a.Stdout)

		for {
			line, err := reader.ReadBytes('\n')
			if err != nil {
				a.Error = err
				c <- SigEnd
				break
			}

			var event Event
			if err = json.Unmarshal(line, &event); err != nil {
				a.Error = err
				c <- SigEnd
				break
			}
		}

		c <- SigEnd
	}()

	return c
}
