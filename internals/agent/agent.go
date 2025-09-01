package agent

import (
    "context"
    "log"
    "os"
    "strings"

    "github.com/openai/openai-go/v2"
    "github.com/openai/openai-go/v2/option"
    "github.com/openai/openai-go/v2/shared"
)

var (
	OPENAI_API_KEY string
	OpenAIClient   openai.Client
)

func init() {
	OPENAI_API_KEY = os.Getenv("OPENAI_API_KEY")
	if OPENAI_API_KEY == "" {
		log.Fatalln("OPENAI_API_KEY is not found but is required!")
	}

	OpenAIClient = openai.NewClient(
		option.WithAPIKey(os.Getenv("OPENAI_API_KEY")),
	)
}

var History = []openai.ChatCompletionMessageParamUnion{}

func ChatWithLLM(_ string) chan string {
    ch := make(chan string, 1024)

	go func() {
		defer close(ch)
        params := openai.ChatCompletionNewParams{
            Messages:        History,
            Model:           openai.ChatModelGPT5Nano,
            ReasoningEffort: shared.ReasoningEffortLow,
        }
        stream := OpenAIClient.Chat.Completions.NewStreaming(context.TODO(), params)

		defer func() {
			if err := stream.Close(); err != nil {
				log.Println("Error during stream.Close():", err)
			}
		}()

        // Add an empty assistant message to History we will update incrementally
        History = append(History, openai.ChatCompletionMessageParamOfAssistant(""))
        // Trigger an initial update so UI can render the placeholder
        select {
        case ch <- "update":
        default:
        }

        acc := openai.ChatCompletionAccumulator{}
        var sb strings.Builder

        for stream.Next() {
            chunk := stream.Current()
            acc.AddChunk(chunk)

            for _, c := range chunk.Choices {
                if c.Delta.Content != "" {
                    sb.WriteString(c.Delta.Content)
                    // Update last assistant message content
                    History[len(History)-1] = openai.ChatCompletionMessageParamOfAssistant(sb.String())
                    // Notify UI to re-render history
                    select {
                    case ch <- "update":
                    default:
                    }
                }
            }

			if _, ok := acc.JustFinishedContent(); ok {
				log.Println("Content generation finished")
			}
			if tool, ok := acc.JustFinishedToolCall(); ok {
				log.Println("Tool call stream finished:", tool.Index, tool.Name, tool.Arguments)
			}
			if refusal, ok := acc.JustFinishedRefusal(); ok {
				log.Println("Refusal stream finished:", refusal)
			}

			if stream.Err() != nil {
				log.Fatalln("Error in the stream:", stream.Err())
			}
		}

        // Final content already stored in the last assistant message in History
    }()

	return ch
}
