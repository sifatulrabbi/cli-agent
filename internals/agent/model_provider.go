package agent

import (
	"context"
	"fmt"
	"log"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/packages/param"
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

func NewDefaultProviderAndModel() ModelProvider {
	return ModelProvider{
		ModelName:       "z-ai/glm-4.6",
		ReasoningEffort: string(openai.ReasoningEffortLow),
		Provider:        ProviderOpenRouter,
	}
}

func (m ModelProvider) Invoke(messages []db.HistoryMessage) ([]db.HistoryMessage, error) {
	switch m.Provider {
	case ProviderOpenAI:
		return m.invokeOpenAIModel(messages)
	case ProviderOpenRouter:
		return m.invokeOpenRouterModel(messages)
	default:
		log.Fatalf("ERROR: Selected provider: %q is not yet supported!\n", m.Provider)
	}
	return messages, fmt.Errorf("selected provider %q is not yet supported", m.Provider)
}

func (m ModelProvider) invokeOpenAIModel(messages []db.HistoryMessage) ([]db.HistoryMessage, error) {
	return m.invokeOpenAICompatibleProvider(messages, option.WithAPIKey(configs.OpenaiAPIKey))
}

func (m ModelProvider) invokeOpenRouterModel(messages []db.HistoryMessage) ([]db.HistoryMessage, error) {
	return m.invokeOpenAICompatibleProvider(
		messages,
		option.WithAPIKey(configs.OpenRouterAPIKey),
		option.WithBaseURL(configs.OpenRouterBaseURL),
	)
}

func (m ModelProvider) invokeOpenAICompatibleProvider(messages []db.HistoryMessage, opts ...option.RequestOption) ([]db.HistoryMessage, error) {
	client := openai.NewClient(opts...)
	params := openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{},
		Model:    openai.ChatModel(m.ModelName),
	}

	if m.ReasoningEffort != "" {
		params.ReasoningEffort = shared.ReasoningEffort(m.ReasoningEffort)
	}

	for _, msg := range messages {
		if msg.IsSystem() {
			if m.ReasoningEffort != "" {
				// for reasoning models openai had suggested to use "developerMessage"
				params.Messages = append(params.Messages, openai.DeveloperMessage(msg.Text))
			} else {
				params.Messages = append(params.Messages, openai.SystemMessage(msg.Text))
			}
		}

		if msg.IsUser() {
			// Since right now the cli agent does not support image or audio inputs.
			params.Messages = append(params.Messages, openai.UserMessage(msg.Text))
		}

		if msg.IsAI() {
			assistant := openai.ChatCompletionAssistantMessageParam{}
			assistant.Content.OfString = param.NewOpt(msg.Text)
			if len(msg.ToolCalls) > 0 {
				for _, tc := range msg.ToolCalls {
					openAIToolCall := openai.ChatCompletionMessageFunctionToolCallParam{
						ID: tc.CallID,
						Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
							Arguments: tc.Args,
							Name:      tc.Name,
						},
						Type: constant.Function("function"),
					}
					assistant.ToolCalls = append(assistant.ToolCalls, openai.ChatCompletionMessageToolCallUnionParam{OfFunction: &openAIToolCall})
				}
			}
			params.Messages = append(params.Messages, openai.ChatCompletionMessageParamUnion{OfAssistant: &assistant})
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
	newAIMsg.Role = db.MsgRoleAI
	newAIMsg.Text = responseMsg.Content
	newAIMsg.RawJSON = responseMsg.RawJSON()
	for _, tc := range responseMsg.ToolCalls {
		newAIMsg.ToolCalls = append(newAIMsg.ToolCalls, db.ToolCall{
			Name:   tc.Function.Name,
			Args:   tc.Function.Arguments,
			CallID: tc.ID,
		})
	}
	newAIMsg.Usage = &db.Usage{}
	newAIMsg.Usage.Total = completion.Usage.TotalTokens
	newAIMsg.Usage.Output = completion.Usage.CompletionTokens
	newAIMsg.Usage.Input = completion.Usage.PromptTokens
	messages = append(messages, newAIMsg)

	return messages, nil
}
