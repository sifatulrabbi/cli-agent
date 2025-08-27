package agent

type Message struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Content   string `json:"content"`
	ToolCalls string `json:"content"`
}
