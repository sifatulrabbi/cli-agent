.PHONY: dev

local-build:
	go build && go install

dev:
	go build && go install && cli-agent

