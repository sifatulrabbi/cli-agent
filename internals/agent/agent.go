package agent

import (
	"encoding/json"
	"log"
	"os"

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
	}()

	return ch
}
