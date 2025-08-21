package main

import (
	"github.com/tmc/langchaingo/llms"
)

var TmpMessages = []llms.ChatMessage{
	llms.HumanChatMessage{Content: "Hello, who are you?"},
	llms.AIChatMessage{Content: "I am an AI assistant. How can I help you today?"},
	llms.HumanChatMessage{Content: "Can you tell me a joke?"},
	llms.AIChatMessage{Content: "Sure! Why don't scientists trust atoms? Because they make up everything."},
}
