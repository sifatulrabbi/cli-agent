package agent

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/shared"
)

type HistoryMessage struct {
	Role    string `json:"role"`
	RawJSON string `json:"raw_json"`
}

func (m HistoryMessage) IsHumanMsg() bool {
	return m.Role == "human"
}

func (m HistoryMessage) IsAIMsg() bool {
	return m.Role == "ai"
}

func (m HistoryMessage) IsToolMsg() bool {
	return m.Role == "tool"
}

func (m HistoryMessage) ToAIMessage() AIMessage {
	var msg AIMessage
	if err := json.Unmarshal([]byte(m.RawJSON), &msg); err != nil {
		log.Println("ERROR: Failed to unmarshal JSON into AIMessage. Raw JSON:", m.RawJSON)
	}
	return msg
}

func (m HistoryMessage) ToHumanMessage() HumanMessage {
	var msg HumanMessage
	if err := json.Unmarshal([]byte(m.RawJSON), &msg); err != nil {
		log.Println("ERROR: Failed to unmarshal JSON into AIMessage. Raw JSON:", m.RawJSON)
	}
	return msg
}

func (m HistoryMessage) ToToolMessage() ToolMessage {
	var msg ToolMessage
	if err := json.Unmarshal([]byte(m.RawJSON), &msg); err != nil {
		log.Println("ERROR: Failed to unmarshal JSON into AIMessage. Raw JSON:", m.RawJSON)
	}
	return msg
}

type AIMessage struct {
	Role      string     `json:"role"`
	RawJSON   string     `json:"raw_json"`
	Reasoning string     `json:"reasoning"`
	Output    string     `json:"output"`
	ToolCalls []ToolCall `json:"tool_calls"`
}

type ToolCall struct {
	Name   string `json:"name"`
	CallID string `json:"call_id"`
	Args   string `json:"args"`
}

type HumanMessage struct {
	Role    string `json:"role"`
	RawJSON string `json:"raw_json"`
	Content string `json:"content"`
}

type ToolMessage struct {
	Role    string `json:"role"`
	RawJSON string `json:"raw_json"`
	Name    string `json:"name"`
	CallID  string `json:"call_id"`
	Args    string `json:"args"`
	Content string `json:"content"`
}

type ModelInfo struct {
	Name      shared.ChatModel
	Reasoning openai.ReasoningEffort
}

func (m ModelInfo) String() string {
	return string(m.Name) + "/" + string(m.Reasoning)
}

const (
	UpdateSig = "update"
)

var (
	History = []HistoryMessage{}
	Model   = ModelInfo{openai.ChatModelGPT5Nano, openai.ReasoningEffortLow}
)

func ChatWithLLM(question string) chan string {
	ch := make(chan string, 1024)
	sendUpdateSig := func() {
		select {
		case ch <- UpdateSig:
		default:
		}
	}

	sendUpdateSig()

	go func() {
		defer close(ch)

		// Append the user's message to history
		human := HumanMessage{Role: "human", Content: question}
		humanRaw, _ := json.Marshal(human)
		History = append(History, HistoryMessage{Role: "human", RawJSON: string(humanRaw)})
		sendUpdateSig()

		// Chat loop with server and manual tool execution
		const maxIterations = 100
		for iter := 0; iter < maxIterations; iter++ {
			if iter >= 99 {
				lastMsg := History[len(History)-1]
				if lastMsg.Role == "ai" {
					errAi, _ := json.Marshal(map[string]any{
						"output": "Max loop reached! Forcefully shutting down the agent.",
					})
					lastMsg.RawJSON = string(errAi)
				}
				break
			}

			// Prepare placeholder AI message in history to be replaced by accumulated updates
			placeholderIndex := len(History)
			placeholder := AIMessage{Role: "ai", Reasoning: "", Output: ""}
			placeholderRaw, _ := json.Marshal(placeholder)
			History = append(History, HistoryMessage{Role: "ai", RawJSON: string(placeholderRaw)})
			sendUpdateSig()

			// Use history BEFORE placeholder for the server
			historyForServer := make([]HistoryMessage, placeholderIndex)
			copy(historyForServer, History[:placeholderIndex])

			aiMsgs, err := callServerStream(historyForServer, func(hm HistoryMessage) {
				// Replace the entire last AI message with the new accumulated one
				if placeholderIndex < len(History) {
					History[placeholderIndex] = hm
				} else {
					History = append(History, hm)
				}
				sendUpdateSig()
			})
			if err != nil {
				log.Println("Agent server error:", err)
				// Surface error to UI as AI message
				ai := AIMessage{Role: "ai", Output: fmt.Sprintf("Error contacting agent server: %v", err)}
				aiRaw, _ := json.Marshal(ai)
				// Replace placeholder with error
				if placeholderIndex < len(History) {
					History[placeholderIndex] = HistoryMessage{Role: "ai", RawJSON: string(aiRaw)}
				} else {
					History = append(History, HistoryMessage{Role: "ai", RawJSON: string(aiRaw)})
				}
				sendUpdateSig()
				return
			}

			// Replace placeholder with first AI message and append any additional ones
			if len(aiMsgs) > 0 {
				History[placeholderIndex] = aiMsgs[0]
				for i := 1; i < len(aiMsgs); i++ {
					History = append(History, aiMsgs[i])
				}
			}
			sendUpdateSig()

			// Inspect the last AI message for tool calls
			if len(aiMsgs) == 0 {
				return
			}
			last := aiMsgs[len(aiMsgs)-1]
			aimsg := last.ToAIMessage()
			if len(aimsg.ToolCalls) == 0 {
				// Done
				return
			}

			// Execute tools and append tool messages
			for _, tc := range aimsg.ToolCalls {
				handler, ok := ToolHandlers[tc.Name]
				var toolOutput string
				if !ok {
					toolOutput = fmt.Sprintf("Tool '%s' not found", tc.Name)
				} else {
					out, err := handler(tc.Args)
					if err != nil {
						toolOutput = fmt.Sprintf("Error executing tool '%s': %v", tc.Name, err)
					} else {
						toolOutput = out
					}
				}

				tmsg := ToolMessage{
					Role:    "tool",
					Name:    tc.Name,
					CallID:  tc.CallID,
					Args:    tc.Args,
					Content: toolOutput,
				}
				tRaw, _ := json.Marshal(tmsg)
				History = append(History, HistoryMessage{Role: "tool", RawJSON: string(tRaw)})
				sendUpdateSig()
			}
		}
	}()

	return ch
}

// ----------------------
// Server interaction
// ----------------------

type chatRequest struct {
	Messages []HistoryMessage `json:"messages"`
	Tools    []map[string]any `json:"tools"`
}

type chatResponse struct {
	Messages []HistoryMessage `json:"messages"`
}

func serverBaseURL() string {
	if v := os.Getenv("CLI_AGENT_SERVER_URL"); v != "" {
		return v
	}
	return "http://127.0.0.1:8080"
}

// func callServerWithHistory(history []HistoryMessage) ([]HistoryMessage, error) {
// 	payload := chatRequest{Messages: history, Tools: buildToolSpecsForServer()}
// 	body, err := json.Marshal(payload)
// 	if err != nil {
// 		return nil, err
// 	}
//
// 	url := serverBaseURL() + "/agent/chat"
// 	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
// 	if err != nil {
// 		return nil, err
// 	}
// 	req.Header.Set("Content-Type", "application/json")
// 	// Allow more generous timeout since tools may run between turns
// 	httpClient := &http.Client{Timeout: 60 * time.Second}
//
// 	resp, err := httpClient.Do(req)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer resp.Body.Close()
//
// 	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
// 		data, _ := io.ReadAll(resp.Body)
// 		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(data))
// 	}
//
// 	var cr chatResponse
// 	dec := json.NewDecoder(resp.Body)
// 	if err := dec.Decode(&cr); err != nil {
// 		return nil, err
// 	}
// 	return cr.Messages, nil
// }

// callServerStream streams partial chunks; returns the final AI HistoryMessage(s)
func callServerStream(history []HistoryMessage, onAcc func(hm HistoryMessage)) ([]HistoryMessage, error) {
	payload := chatRequest{Messages: history, Tools: buildToolSpecsForServer()}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	url := serverBaseURL() + "/agent/stream"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 0} // no timeout for stream; rely on server
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(data))
	}

	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	var finals []HistoryMessage
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return finals, err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		payload := strings.TrimPrefix(line, "data: ")
		var evt struct {
			Type    string          `json:"type"`
			Text    string          `json:"text"`
			Message json.RawMessage `json:"message"`
		}
		if err := json.Unmarshal([]byte(payload), &evt); err != nil {
			continue
		}
		switch evt.Type {
		case "acc":
			if onAcc != nil {
				var hm HistoryMessage
				if err := json.Unmarshal(evt.Message, &hm); err == nil {
					onAcc(hm)
				}
			}
		case "final":
			var hm HistoryMessage
			// evt.Message is a serialized HistoryMessage
			if err := json.Unmarshal(evt.Message, &hm); err == nil {
				finals = append(finals, hm)
			}
		}
	}
	return finals, nil
}
