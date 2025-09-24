package agent

import (
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/db"
)

type CliAgent struct {
	History       *db.AgentHistory `json:"history"`
	ModelProvider ModelProvider    `json:"modelProvider"`
}

func NewAgent(history *db.AgentHistory) *CliAgent {
	modelNameParts := strings.Split(history.ModelName, "/")
	modelProvider := ModelProvider{"", "", ""}
	if len(modelNameParts) == 2 {
		modelProvider.ModelName = modelNameParts[0]
		modelProvider.ReasoningEffort = modelNameParts[1]
	} else {
		modelProvider.ModelName = modelNameParts[0]
	}
	return &CliAgent{
		history,
		modelProvider,
	}
}

func (a CliAgent) Invoke(userInput string) chan string {
	ch := make(chan string)
	return ch
}
