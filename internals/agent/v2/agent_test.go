package agent

import (
	"fmt"
	"testing"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
	"github.com/sifatulrabbi/cli-agent/internals/db"
)

func TestAgent(t *testing.T) {
	configs.Prepare()

	modelProvider := ModelProvider{"gpt-5-mini", "low", ProviderOpenAI}
	testMessages := []db.HistoryMessage{
		{
			Role: db.MsgRoleUser,
			Text: "Hello who are you?",
		},
	}
	fmt.Println("Invoking the LLM...")
	res, err := modelProvider.Invoke(testMessages)
	fmt.Println("LLM responded.")
	fmt.Println(res, err)
}
