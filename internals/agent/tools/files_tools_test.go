package tools

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
)

func TestAppendFile(t *testing.T) {
	configs.Prepare()
	configs.WorkingPath = "/Users/sifatul/coding/cli-agent/tmp"

	args := AppendFileToolArgs{
		FilePath: "./something/hello.txt",
		Inserts:  []FileInsert{{InsertAfter: 0, Content: "Hello world"}},
	}
	argsStr, _ := json.Marshal(args)
	out, err := handleAppendFile(string(argsStr))
	if err != nil {
		t.Error(err)
		t.Fail()
	}
	fmt.Println(out)
}
