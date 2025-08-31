package agent

type Thread struct {
	ID        string    `json:"id"`
	CreatedAt string    `json:"created_at"`
	UpdatedAt string    `json:"updated_at"`
	DeletedAt string    `json:"deleted_at"`
	ModelName string    `json:"model_name"`
	Usage     string    `json:"usage"`
	Messages  []Message `json:"messages"`
}

type Message struct {
	ID        string     `json:"id"`
	ThreadID  string     `json:"thread_id"`
	Content   string     `json:"content"`
	ToolCalls []ToolCall `json:"tool_calls"`
	Type      string     `json:"type"`
}

type ToolCall struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Args string `json:"args"`
}
