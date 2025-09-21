package db

import (
	"time"
)

const (
	MsgRoleAI     = "ai"
	MsgRoleUser   = "human"
	MsgRoleTool   = "tool"
	MsgRoleSystem = "system"
)

type ToolCall struct {
	Name   string `json:"name"`
	CallID string `json:"call_id"`
	Args   string `json:"args"`
}

type Usage struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
	Total  int64 `json:"total"`
}

type HistoryMessage struct {
	Role       string     `json:"role"`
	Reasoning  string     `json:"reasoning"`
	ToolCalls  []ToolCall `json:"toolCalls"`
	Text       string     `json:"text"`
	ToolCallID string     `json:"toolCallId"`
	RawJSON    string     `json:"rawJson"`
	Usage      *Usage     `json:"usage"`
}

func (hm HistoryMessage) IsAI() bool { return hm.Role == MsgRoleAI }

func (hm HistoryMessage) IsUser() bool { return hm.Role == MsgRoleUser }

func (hm HistoryMessage) IsTool() bool { return hm.Role == MsgRoleTool }

func (hm HistoryMessage) IsSystem() bool { return hm.Role == MsgRoleSystem }

type AgentHistory struct {
	SessionID   string           `json:"sessionId"`
	WorkingPath string           `json:"workingPath"`
	ModelName   string           `json:"modelName"` // e.g. gpt-5/medium
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
	Messages    []HistoryMessage `json:"messages"`
}

func (ah AgentHistory) GetSessionUsage() Usage {
	totalIn := int64(0)
	totalOut := int64(0)
	total := int64(0)
	for _, msg := range ah.Messages {
		if msg.Usage != nil {
			totalIn += msg.Usage.Input
			totalOut += msg.Usage.Output
			total += msg.Usage.Total
		}
	}
	return Usage{Input: totalIn, Output: totalOut, Total: total}
}

func GetHistory(workingPath string) (*AgentHistory, error) {
	return nil, nil
}

func SaveHistory(history *AgentHistory) error {
	return nil
}
