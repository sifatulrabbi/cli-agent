package agent

import (
	"github.com/openai/openai-go/v2"
	"github.com/openai/openai-go/v2/option"
)

var openaiClient = openai.NewClient(
	option.WithAPIKey("My API Key"), // defaults to os.LookupEnv("OPENAI_API_KEY")
)
