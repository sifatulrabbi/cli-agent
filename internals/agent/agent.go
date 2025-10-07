package agent

import (
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/db"
)

type CLIAgent struct {
	History       *db.AgentHistory `json:"history"`
	ModelProvider ModelProvider    `json:"modelProvider"`
	AgentMode     string           `json:"agentMode"` // Agent or Plan
}

func NewAgent(history *db.AgentHistory) *CLIAgent {
	modelNameParts := strings.Split(history.ModelName, "/")
	modelProvider := NewDefaultProviderAndModel()
	if len(modelNameParts) == 2 {
		modelProvider.ModelName = modelNameParts[0]
		modelProvider.ReasoningEffort = modelNameParts[1]
	} else {
		modelProvider.ModelName = modelNameParts[0]
	}
	return &CLIAgent{
		ModelProvider: modelProvider,
		History:       history,
		AgentMode:     "Agent",
	}
}

func (a CLIAgent) ListAvailableModels() {
}

func (a CLIAgent) Invoke(userInput string) chan string {
	ch := make(chan string)
	return ch
}
