package agent

import (
	"context"
	"log"

	openai "github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/packages/param"
)

func ChatWithLLM(question string) chan string {
	log.Println("Invoking LLM...")

	ch := make(chan string, 256)
	client := openai.NewClient() // defaults to os.LookupEnv("OPENAI_API_KEY")

	go func() {
		defer close(ch)

		stream := client.Chat.Completions.NewStreaming(context.Background(), openai.ChatCompletionNewParams{
			Messages: []openai.ChatCompletionMessageParamUnion{
				openai.UserMessage(question),
			},
			Model: openai.ChatModelGPT4_1Mini,
			StreamOptions: openai.ChatCompletionStreamOptionsParam{
				IncludeUsage: param.Opt[bool]{Value: true},
			},
		})
		acc := openai.ChatCompletionAccumulator{}

		for stream.Next() {
			chunk := stream.Current()
			acc.AddChunk(chunk)
			if len(chunk.Choices) > 0 {
				for _, c := range chunk.Choices {
					ch <- c.Delta.Content
				}
			}
			// if content, ok := acc.JustFinishedContent(); ok {
			// 	println("Content stream finished:", content)
			// }
			// if tool, ok := acc.JustFinishedToolCall(); ok {
			// 	println("Tool call stream finished:", tool.Index, tool.Name, tool.Arguments)
			// }
			// if refusal, ok := acc.JustFinishedRefusal(); ok {
			// 	println("Refusal stream finished:", refusal)
			// }
			// if len(chunk.Choices) > 0 {
			// 	println(chunk.Choices[0].Delta.Content)
			// }
		}
		if stream.Err() != nil {
			log.Fatalln("Error from LLM:", stream.Err())
		}

		_ = acc.Choices[0].Message.Content
	}()

	return ch
}
