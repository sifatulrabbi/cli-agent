#!/usr/bin/env bun

for await (const line of console) {
  console.error("  Got:", line);
  process.stdout.write(
    `{"type": "ai", "content": "Hello world", "input": "${line}"}\n`,
  );
}
