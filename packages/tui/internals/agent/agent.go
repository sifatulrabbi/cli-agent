package agent

import (
	"context"
	"log"
	"os"

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

func ChatWithLLM(question string) chan string {
	ch := make(chan string, 1024)

	go func() {
		defer close(ch)

		params := openai.ChatCompletionNewParams{
			Messages:        []openai.ChatCompletionMessageParamUnion{openai.UserMessage(question)},
			Model:           openai.ChatModelGPT5Nano,
			ReasoningEffort: shared.ReasoningEffortLow,
		}
		stream := OpenAIClient.Chat.Completions.NewStreaming(context.TODO(), params)

		defer func() {
			if err := stream.Close(); err != nil {
				log.Println("Error during stream.Close():", err)
			}
		}()

		acc := openai.ChatCompletionAccumulator{}

		for stream.Next() {
			chunk := stream.Current()
			acc.AddChunk(chunk)

			for _, c := range chunk.Choices {
				ch <- c.Delta.Content
			}

			if content, ok := acc.JustFinishedContent(); ok {
				log.Println("Content generation finished:", content)
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
	}()

	return ch
}
