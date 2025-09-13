package utils

import (
	"log"

	"github.com/tiktoken-go/tokenizer"
)

func CountTokens(content string) int {
	enc, err := tokenizer.Get(tokenizer.O200kBase)
	if err != nil {
		log.Println("ERROR: Failed to load the tokenizer.", err)
		return 0
	}
	ids, _, _ := enc.Encode(content)
	return len(ids)
}
