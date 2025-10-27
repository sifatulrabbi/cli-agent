package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
)

type EventType = string

type HistoryMessage struct {
	ID        string `json:"id"`
	Reasoning string `json:"reasoning"`
	Content   string `json:"content"`
	ToolName  string `json:"toolName"`
	ToolArgs  string `json:"toolArgs"`
}

type MsgEvent struct {
	Event       EventType        `json:"event"` // end | delta | start
	WorkingPath string           `json:"workingPath,omitempty"`
	UserInput   string           `json:"userInput,omitempty"`
	History     []HistoryMessage `json:"history,omitempty"`
}

const (
	EventStart EventType = "start"
	EventDelta EventType = "delta"
	EventEnd   EventType = "end"
)

func main() {
	workingPath, err := os.Getwd()
	if err != nil {
		log.Fatalln("Unable to get the current working directory:", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	agentPath := "./agent/src/runner.ts"
	_, err = os.Open(agentPath)
	if err != nil {
		log.Fatalln("File does not exist", err)
	}

	cmd := exec.CommandContext(ctx, "bun", agentPath)
	serverStdin, err := cmd.StdinPipe()
	if err != nil {
		log.Fatalln("Unable to pipe the stdin:", err)
	}
	serverStdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalln("Unable to pipe the stdout:", err)
	}
	serverStderr, err := cmd.StderrPipe()
	if err != nil {
		log.Fatal(err)
	}

	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	if err := cmd.Start(); err != nil {
		log.Fatalf("failed to start agent: %v", err)
	}

	// Forward agent's stderr to ours for debugging
	go io.Copy(os.Stderr, serverStderr)

	go readAndPrintServerEvents(serverStdout)

	go func() {
		enc := json.NewEncoder(serverStdin)
		enc.SetEscapeHTML(false)

		reader := bufio.NewReader(os.Stdin)
		for {
			input, _ := reader.ReadString('\n')
			input = strings.TrimSpace(input) // remove trailing newline

			if err = enc.Encode(MsgEvent{
				WorkingPath: workingPath,
				Event:       EventStart,
				UserInput:   input,
				History:     []HistoryMessage{},
			}); err != nil {
				log.Fatalln("Error when sending data thru stdin:", err)
			}
		}
	}()

	err = cmd.Wait()
	if err != nil {
		log.Fatalln(err)
	}
	<-ctx.Done()
}

func readAndPrintServerEvents(serverStdout io.Reader) {
	var msgCache []HistoryMessage

	rd := bufio.NewReader(serverStdout)
	for {
		line, err := rd.ReadBytes('\n')
		if err != nil {
			log.Fatalln("Error reading the lines:", err)
		}

		var msgEvent MsgEvent
		if err := json.Unmarshal(line, &msgEvent); err != nil {
			log.Fatalln("Invalid event from the server:", err, "\nEvent:", string(line))
		}

		switch msgEvent.Event {
		case EventStart:
			msgCache = append(msgCache, msgEvent.History...)

		case EventDelta:
			for i := len(msgEvent.History) - 1; i >= 0; i-- {
				delta := msgEvent.History[i]
				last := -1

				for i, msg := range msgCache {
					if msg.ID == delta.ID {
						last = i
						break
					}
				}

				if last < 0 {
					msgCache = append(msgCache, delta)
					continue
				}

				cachedMsg := msgCache[last]

				if delta.Reasoning != "" {
					cachedMsg.Reasoning = delta.Reasoning
				}
				if delta.Content != "" {
					cachedMsg.Content = delta.Content
				}
				if delta.ToolName != "" {
					cachedMsg.ToolName = delta.ToolName
				}
				if delta.ToolArgs != "" {
					cachedMsg.ToolArgs = delta.ToolArgs
				}

				msgCache[last] = cachedMsg
				last--
			}

		case EventEnd:
			for i := len(msgEvent.History) - 1; i >= 0; i-- {
				delta := msgEvent.History[i]
				for i, msg := range msgCache {
					if msg.ID == delta.ID {
						msgCache[i] = delta
						break
					}
				}
			}
		}

		fmt.Printf("History count: %d.\nDelta: %s\n", len(msgCache), msgEvent)
	}
}
