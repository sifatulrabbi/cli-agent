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

// type Usage struct {
// 	Input  int `json:"input"`
// 	Output int `json:"output"`
// 	Total  int `json:"total"`
// }

type AgentHistory struct {
	SessionID   string           `json:"sessionId"`
	WorkingPath string           `json:"workingPath"`
	ModelName   string           `json:"modelName"` // e.g. gpt-5/medium
	CreatedAt   time.Time        `json:"createdAt"`
	UpdatedAt   time.Time        `json:"updatedAt"`
	Messages    []HistoryMessage `json:"messages"`
}

type HistoryMessage struct {
	Role       string     `json:"role"`
	Reasoning  string     `json:"reasoning"`
	ToolCalls  []ToolCall `json:"toolCalls"`
	Text       string     `json:"text"`
	ToolCallID string     `json:"toolCallId"`
	// RawJSON    string     `json:"rawJson"`
	// Usage      Usage      `json:"usage"`
}

func (m HistoryMessage) IsAI() bool { return m.Role == MsgRoleAI }

func (m HistoryMessage) IsUser() bool { return m.Role == MsgRoleUser }

func (m HistoryMessage) IsTool() bool { return m.Role == MsgRoleTool }

func (m HistoryMessage) IsSystem() bool { return m.Role == MsgRoleSystem }

func GetHistory(workingPath string) (*AgentHistory, error) {
	return nil, nil
}

func SaveHistory(history *AgentHistory) error {
	return nil
}
