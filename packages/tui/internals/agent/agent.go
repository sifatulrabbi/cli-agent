package agent

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
)

func ChatWithLLM(question string) chan string {
	log.Println("Invoking LLM...")

	ch := make(chan string, 256)

	go func() {
		defer close(ch)

		payload := struct {
			Input string `json:"input"`
		}{Input: question}
		body, err := json.Marshal(payload)
		if err != nil {
			log.Printf("marshal error: %v", err)
			return
		}

		req, err := http.NewRequest("POST", "http://localhost:8080/chat/stream", bytes.NewReader(body))
		if err != nil {
			log.Printf("request build error: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/plain")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("request error: %v", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			b, _ := io.ReadAll(resp.Body)
			log.Printf("bad status: %s body: %s", resp.Status, string(b))
			return
		}

		for {
			buf := make([]byte, 2048)
			n, err := resp.Body.Read(buf)
			if n > 0 {
				ch <- string(buf)
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("stream read error: %v", err)
				}
				break
			}
		}
	}()

	return ch
}
