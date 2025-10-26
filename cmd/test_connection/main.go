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

type Msg struct {
	Type  string `json:"type"`
	ID    string `json:"id,omitempty"`
	Input string `json:"input,omitempty"`
	Delta string `json:"delta,omitempty"`
	Final string `json:"final,omitempty"`
	Error string `json:"error,omitempty"`
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	agentPath := "./agent/src/runner.ts"
	_, err := os.Open(agentPath)
	if err != nil {
		log.Fatalln("File does not exist", err)
	}

	cmd := exec.CommandContext(ctx, "bun", agentPath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		log.Fatalln("Unable to pipe the stdin:", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalln("Unable to pipe the stdout:", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		log.Fatal(err)
	}

	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	if err := cmd.Start(); err != nil {
		log.Fatalf("failed to start agent: %v", err)
	}

	// Forward agent's stderr to ours for debugging
	go io.Copy(os.Stdout, stderr)

	go func() {
		rd := bufio.NewReader(stdout)
		for {
			line, err := rd.ReadBytes('\n')
			if err != nil {
				log.Fatalln("Error reading the lines:", err)
			}
			fmt.Println("AI:", string(line))
		}
	}()

	go func() {
		enc := json.NewEncoder(stdin)
		enc.SetEscapeHTML(false)
		reader := bufio.NewReader(os.Stdin)

		for {
			fmt.Print("USER: ")
			input, _ := reader.ReadString('\n')
			input = strings.TrimSpace(input) // remove trailing newline
			if err = enc.Encode(Msg{Type: "user", ID: "1", Input: input}); err != nil {
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
