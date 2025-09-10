package tools

import (
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/sifatulrabbi/cli-agent/internals/configs"
)

type TodoItem struct {
	Id   int    `json:"id"`
	Task string `json:"task"`
	Done bool   `json:"done"`
}

func getExistingTodoContent() []TodoItem {
	if c, err := os.ReadFile(configs.TodosFile); err != nil {
		return []TodoItem{}
	} else {
		todoList := []TodoItem{}
		if err = json.Unmarshal(c, &todoList); err != nil {
			return todoList
		}
		return todoList
	}
}

func saveTodoList(todoList []TodoItem) {
	if c, err := json.Marshal(todoList); err != nil {
		log.Println("Error Marshaling the todo list:", err)
	} else {
		if err = os.WriteFile(configs.TodosFile, c, 0o644); err != nil {
			log.Println("Error updating the todo list file:", err)
		}
	}
}

func handleAddTodo(argsJSON string) (string, error) {
	var args struct {
		Todos []string
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	if len(args.Todos) < 1 {
		return "Successfully updated the todo list.", nil
	}
	todoList := getExistingTodoContent()
	for i, task := range args.Todos {
		existingTodo := false
		for _, t := range todoList {
			if strings.TrimSpace(t.Task) == strings.TrimSpace(task) {
				existingTodo = true
				break
			}
		}
		if existingTodo {
			continue
		}
		todoList = append(todoList, TodoItem{Id: len(todoList) + i + 1, Task: task, Done: false})
	}
	saveTodoList(todoList)
	return "Successfully updated the todo list.", nil
}

func handleMarkTodoAsDone(argsJSON string) (string, error) {
	var args struct {
		Ids []int
	}
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return "", err
	}
	if len(args.Ids) < 1 {
		return "Successfully updated the todo list.", nil
	}
	todoList := getExistingTodoContent()
	for _, id := range args.Ids {
		for i, todo := range todoList {
			if todo.Id == id {
				todoList[i].Done = true
			}
		}
	}
	saveTodoList(todoList)
	return "Successfully updated the todo list.", nil
}
