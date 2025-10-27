.PHONY: dev

local-build:
	go build && go install

dev:
	go build && go install && GOENV=dev cli-agent

server-dev:
	python3 ./server/main.py
