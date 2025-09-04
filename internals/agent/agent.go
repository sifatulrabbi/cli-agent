package agent

import (
	"context"
	"log"
	"os"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/shared"
)

const UpdateSig = "update"

var (
	OPENAI_API_KEY string
	OpenAIClient   openai.Client
)

func init() {
	OPENAI_API_KEY = os.Getenv("OPENAI_API_KEY")
	if OPENAI_API_KEY == "" {
		log.Fatalln("OPENAI_API_KEY is not found but is required!")
	}

	OpenAIClient = openai.NewClient(option.WithAPIKey(OPENAI_API_KEY))
}

var History = []openai.ChatCompletionMessageParamUnion{}

func ChatWithLLM(question string) chan string {
	ch := make(chan string, 1024)
	sendUpdateSig := func() {
		select {
		case ch <- UpdateSig:
		default:
		}
	}

	History = append(History, openai.UserMessage(question))
	History = append(History, openai.AssistantMessage("Processing your request..."))
	sendUpdateSig()

	go func() {
		defer close(ch)

		for {
			withSysPrompt := append([]openai.ChatCompletionMessageParamUnion{}, openai.DeveloperMessage(SysPrompt))
			withSysPrompt = append(withSysPrompt, History...)
			params := openai.ChatCompletionNewParams{
				Messages:          withSysPrompt,
				Model:             openai.ChatModelGPT5Nano,
				ReasoningEffort:   shared.ReasoningEffortLow,
				Tools:             Tools,
				ParallelToolCalls: openai.Bool(false),
			}

			stream := OpenAIClient.Chat.Completions.NewStreaming(context.TODO(), params)

			pendingCalls := []openai.FinishedChatCompletionToolCall{}
			acc := openai.ChatCompletionAccumulator{}
			for stream.Next() {
				chunk := stream.Current()
				acc.AddChunk(chunk)

				if _, ok := acc.JustFinishedContent(); ok {
					log.Println("Content generation finished")
				}
				if tool, ok := acc.JustFinishedToolCall(); ok {
					pendingCalls = append(pendingCalls, tool)
				}
				if refusal, ok := acc.JustFinishedRefusal(); ok {
					log.Println("Refusal stream finished:", refusal)
				}

				if stream.Err() != nil {
					log.Fatalln("Error in the stream:", stream.Err())
				}

				if len(acc.Choices) > 0 {
					History[len(History)-1] = acc.Choices[0].Message.ToParam()
					sendUpdateSig()
				}
			}

			if err := stream.Close(); err != nil {
				log.Println("Error during stream.Close():", err)
			}

			if len(acc.Choices) > 0 {
				History[len(History)-1] = acc.Choices[0].Message.ToParam()
				sendUpdateSig()
			}

			var toolCalls []openai.ChatCompletionMessageToolCallUnion
			if len(acc.Choices) > 0 {
				toolCalls = acc.Choices[0].Message.ToolCalls
			}

			if len(pendingCalls) == 0 && len(toolCalls) == 0 {
				// No tools requested; we're done.
				break
			}

			// Execute tool calls captured during streaming when available; otherwise fallback
			if len(pendingCalls) > 0 {
				for _, pc := range pendingCalls {
					name := pc.Name
					args := pc.Arguments
					id := pc.ID
					handler := ToolHandlers[name]

					var out string
					if handler == nil {
						out = "Tool '" + name + "' not implemented."
					} else {
						res, err := handler(args)
						if err != nil {
							out = err.Error()
						} else {
							out = res
						}
					}

					History = append(History, openai.ToolMessage(out, id))
					sendUpdateSig()
				}
			} else {
				for _, tc := range toolCalls {
					f := tc.AsFunction()
					name := f.Function.Name
					args := f.Function.Arguments
					id := f.ID
					handler := ToolHandlers[name]

					var out string
					if handler == nil {
						out = "Tool '" + name + "' not implemented."
					} else {
						res, err := handler(args)
						if err != nil {
							out = err.Error()
						} else {
							out = res
						}
					}

					History = append(History, openai.ToolMessage(out, id))
					sendUpdateSig()
				}
			}

			History = append(History, openai.AssistantMessage("Processing tool results..."))
		}
	}()

	return ch
}
