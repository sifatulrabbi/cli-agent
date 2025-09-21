package agent

import (
	"context"
	"fmt"
	"log"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/shared"
	"github.com/openai/openai-go/v2/shared/constant"
	"github.com/sifatulrabbi/cli-agent/internals/configs"
	"github.com/sifatulrabbi/cli-agent/internals/db"
)

const (
	ProviderOpenAI     = "openai"
	ProviderOpenRouter = "openrouter"
)

type ModelProvider struct {
	ModelName       string `json:"modelName"`
	ReasoningEffort string `json:"reasoningEffort"`
	Provider        string `json:"provider"`
}

func (m ModelProvider) Invoke(messages []db.HistoryMessage) ([]db.HistoryMessage, error) {
	switch m.Provider {
	case ProviderOpenAI:
		return m.invokeOpenAIModel(messages)
	default:
		log.Fatalf("ERROR: Selected provider: %q is not yet supported!\n", m.Provider)
	}
	return messages, fmt.Errorf("selected provider %q is not yet supported", m.Provider)
}

func (m ModelProvider) invokeOpenAIModel(messages []db.HistoryMessage) ([]db.HistoryMessage, error) {
	client := openai.NewClient(option.WithAPIKey(configs.OpenaiAPIKey))
	params := openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{},
		Model:    openai.ChatModel(m.ModelName),
	}

	if m.ReasoningEffort != "" {
		params.ReasoningEffort = shared.ReasoningEffort(m.ReasoningEffort)
	}

	for _, msg := range messages {
		if msg.IsSystem() {
			params.Messages = append(params.Messages, openai.SystemMessage(msg.Text))
		}

		if msg.IsUser() {
			// Since right now the cli agent does not support image or audio inputs.
			params.Messages = append(params.Messages, openai.UserMessage(msg.Text))
		}

		if msg.IsAI() {
			assistantParamUnion := openai.ChatCompletionMessageParamUnion{
				OfAssistant: &openai.ChatCompletionAssistantMessageParam{
					Content:   openai.ChatCompletionAssistantMessageParamContentUnion{OfString: openai.String(msg.Text)},
					Role:      constant.Assistant("assistant"),
					ToolCalls: []openai.ChatCompletionMessageToolCallUnionParam{},
				},
			}
			if len(msg.ToolCalls) > 0 {
				for _, tc := range msg.ToolCalls {
					assistantParamUnion.OfAssistant.ToolCalls = append(assistantParamUnion.OfAssistant.ToolCalls, openai.ChatCompletionMessageToolCallUnionParam{
						OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
							ID:       tc.CallID,
							Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{Arguments: tc.Args, Name: tc.Name},
							Type:     constant.Function("function"),
						},
					})
				}
			}
			params.Messages = append(params.Messages, assistantParamUnion)
		}

		if msg.IsTool() {
			params.Messages = append(params.Messages, openai.ToolMessage(msg.Text, msg.ToolCallID))
		}
	}

	completion, err := client.Chat.Completions.New(context.TODO(), params)
	if err != nil {
		log.Fatalln("Failed to use the OpenAI model:", err)
		return messages, err
	}

	responseMsg := completion.Choices[0].Message
	newAIMsg := db.HistoryMessage{}
	newAIMsg.Text = responseMsg.Content
	for _, tc := range responseMsg.ToolCalls {
		newAIMsg.ToolCalls = append(newAIMsg.ToolCalls, db.ToolCall{
			Name:   tc.Function.Name,
			Args:   tc.Function.Arguments,
			CallID: tc.ID,
		})
	}
	messages = append(messages, newAIMsg)

	return messages, nil
}
