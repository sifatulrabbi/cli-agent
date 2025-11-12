package agent

import (
	"fmt"
	"testing"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
	"github.com/sifatulrabbi/cli-agent/internals/db"
)

func TestAgent(t *testing.T) {
	configs.Prepare()
	modelProvider := NewDefaultProviderAndModel()
	messages := []db.HistoryMessage{
		{
			Role: db.MsgRoleSystem,
			Text: `You are a helpful assistant. Help the user with their tasks.
- Your replies must be concise and to the point
- Never over explain things; get to the point immediately.`,
		},
	}
	testUserInputs := []string{
		"Hi, I'm Sifatul.",
		"What can you do for me?",
		"Can you write me a python script that display the current memory usage of my system?",
		"explain the script just wrote as if I'm a 5 years old.",
	}
	for _, userMsg := range testUserInputs {
		messages = append(messages, db.HistoryMessage{
			Role: db.MsgRoleUser,
			Text: userMsg,
		})
		fmt.Println("USER: ", userMsg)

		res, err := modelProvider.Invoke(messages)
		if err != nil {
			t.Fatal(err)
		}
		messages = res
		fmt.Println("AI:", messages[len(messages)-1].Text)
		fmt.Println()
		fmt.Println("----------------------------")
		fmt.Println()
	}
}
