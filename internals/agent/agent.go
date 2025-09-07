package agent

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/openai/openai-go/v2"
    "github.com/openai/openai-go/v2/option"
    "github.com/openai/openai-go/v2/responses"
    "github.com/openai/openai-go/v2/shared"
)

type ModelInfo struct {
	Name      shared.ChatModel
	Reasoning openai.ReasoningEffort
}

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

type AgentHistory struct {
	InputParams *responses.ResponseNewParams
	Output      *responses.Response
}

func (m ModelInfo) String() string {
	return string(m.Name) + "/" + string(m.Reasoning)
}

const (
	UpdateSig = "update"
)

var (
	OPENAI_API_KEY string = ""
	OpenAIClient   openai.Client
	Model          = ModelInfo{openai.ChatModelGPT5Nano, openai.ReasoningEffortLow}
)

func init() {
	OPENAI_API_KEY = os.Getenv("OPENAI_API_KEY")
	if OPENAI_API_KEY == "" {
		log.Fatalln("OPENAI_API_KEY is not found but is required!")
	}

	OpenAIClient = openai.NewClient(option.WithAPIKey(OPENAI_API_KEY))
}

var History = []HistoryMessage{}

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
        const maxIterations = 8
        for iter := 0; iter < maxIterations; iter++ {
            // Call the Python agent server
            aiMsgs, err := callServerWithHistory(History)
            if err != nil {
                log.Println("Agent server error:", err)
                // Surface error to UI as AI message
                ai := AIMessage{Role: "ai", Output: fmt.Sprintf("Error contacting agent server: %v", err)}
                aiRaw, _ := json.Marshal(ai)
                History = append(History, HistoryMessage{Role: "ai", RawJSON: string(aiRaw)})
                sendUpdateSig()
                return
            }

            // Append returned AI messages (usually 1)
            for _, hm := range aiMsgs {
                History = append(History, hm)
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
            // Loop continues to send tool outputs back to the agent
        }
    }()

	return ch
}

// ----------------------
// Server interaction
// ----------------------

type chatRequest struct {
    Messages []HistoryMessage `json:"messages"`
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

func callServerWithHistory(history []HistoryMessage) ([]HistoryMessage, error) {
    payload := chatRequest{Messages: history}
    body, err := json.Marshal(payload)
    if err != nil {
        return nil, err
    }

    url := serverBaseURL() + "/agent/chat"
    req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
    if err != nil {
        return nil, err
    }
    req.Header.Set("Content-Type", "application/json")
    // Allow more generous timeout since tools may run between turns
    httpClient := &http.Client{Timeout: 60 * time.Second}

    resp, err := httpClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        data, _ := io.ReadAll(resp.Body)
        return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(data))
    }

    var cr chatResponse
    dec := json.NewDecoder(resp.Body)
    if err := dec.Decode(&cr); err != nil {
        return nil, err
    }
    return cr.Messages, nil
}
