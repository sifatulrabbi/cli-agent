package agent

import (
	"context"
	"log"
	"os"

	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
	"github.com/openai/openai-go/v2/responses"
	"github.com/openai/openai-go/v2/shared"
)

type ModelInfo struct {
	Name      shared.ChatModel
	Reasoning openai.ReasoningEffort
}

type AgentHistory struct {
	InputParams *responses.ResponseNewParams
	Output      *responses.Response
}

func (m ModelInfo) String() string {
	return string(m.Name) + "/" + string(m.Reasoning)
}

const (
	UpdateSig = "update"
)

var (
	OPENAI_API_KEY string = ""
	OpenAIClient   openai.Client
	Model          = ModelInfo{openai.ChatModelGPT5Nano, openai.ReasoningEffortLow}
)

func init() {
	OPENAI_API_KEY = os.Getenv("OPENAI_API_KEY")
	if OPENAI_API_KEY == "" {
		log.Fatalln("OPENAI_API_KEY is not found but is required!")
	}

	OpenAIClient = openai.NewClient(option.WithAPIKey(OPENAI_API_KEY))
}

var History = []*AgentHistory{}

func ChatWithLLM(question string) chan string {
	ch := make(chan string, 1024)
	sendUpdateSig := func() {
		select {
		case ch <- UpdateSig:
		default:
		}
	}

	sendUpdateSig()

	go func() {
		defer close(ch)

		// Safety cap to avoid runaway loops
		const maxTurns = 24

		// Maintain the input union across iterations per Responses API guidance.
		// Start with a user message; then append tool calls + outputs across turns.
		inputUnion := responses.ResponseNewParamsInputUnion{}
		inputUnion.OfInputItemList = append(inputUnion.OfInputItemList,
			responses.ResponseInputItemParamOfMessage(question, responses.EasyInputMessageRoleUser),
		)

		for i := 0; i < maxTurns; i++ {
			var prevTurn *AgentHistory = nil
			if len(History) > 0 {
				prevTurn = History[len(History)-1]
			}
			// For iterations after the first within this user turn, collect the tool
			// calls from the previous assistant output and append both the function
			// calls and their outputs to the persistent input.
			if i > 0 {
				toolCalls := []responses.ResponseFunctionToolCall{}
				if prevTurn != nil && prevTurn.Output != nil {
					for _, part := range prevTurn.Output.Output {
						if part.Type != "function_call" {
							continue
						}
						fnCall := part.AsFunctionCall()
						toolCalls = append(toolCalls, fnCall)
					}
				}

				if len(toolCalls) < 1 {
					// No tool calls requested: end the agent loop
					break
				}

				log.Printf("LLM requested %d tool call(s).\n", len(toolCalls))

				for _, tc := range toolCalls {
					// 1) Record the model's tool call in the input for continuity
					inputUnion.OfInputItemList = append(inputUnion.OfInputItemList,
						responses.ResponseInputItemParamOfFunctionCall(tc.Arguments, tc.CallID, tc.Name),
					)

					// 2) Execute the tool and provide its output
					handler := ToolHandlers[tc.Name]
					if handler == nil {
						log.Println("ERROR: invalid tool call from the model:", tc.RawJSON())
						inputUnion.OfInputItemList = append(inputUnion.OfInputItemList,
							responses.ResponseInputItemParamOfFunctionCallOutput(tc.CallID, "Invalid tool call from model."),
						)
						continue
					}

					toolRes := ""
					if res, err := handler(tc.Arguments); err != nil {
						log.Println("Tool ERROR:", err)
						toolRes = "Failed to use the tool. Error: " + err.Error()
					} else {
						log.Println("Tool used:", tc.Name)
						toolRes = res
					}
					inputUnion.OfInputItemList = append(inputUnion.OfInputItemList,
						responses.ResponseInputItemParamOfFunctionCallOutput(tc.CallID, toolRes),
					)
				}
			}

			turn := AgentHistory{
				InputParams: &responses.ResponseNewParams{
					Instructions: openai.String(SysPrompt),
					Model:        Model.Name,
					Reasoning: shared.ReasoningParam{
						Effort:  Model.Reasoning,
						Summary: shared.ReasoningSummaryAuto,
					},
					Tools: ToolsNew,
					Input: inputUnion,
				},
				Output: nil,
			}
			// Chain to the latest response for continuity across the loop and across
			// prior conversations in History.
			if len(History) > 0 {
				latest := History[len(History)-1]
				if latest != nil && latest.Output != nil && latest.Output.ID != "" {
					turn.InputParams.PreviousResponseID = openai.String(latest.Output.ID)
				}
			}
			History = append(History, &turn)
			sendUpdateSig()

			res, err := OpenAIClient.Responses.New(context.TODO(), *turn.InputParams)
			if err != nil {
				log.Println("Error during response creation:", err)
				return
			}
			turn.Output = res
			History[len(History)-1] = &turn
			sendUpdateSig()
		}
	}()

	return ch
}
