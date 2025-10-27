package tools

// Handlers maps tool name to an executor that returns a string result.
var Handlers = map[string]func(argsJSON string) (string, error){
	ToolListFiles:      handleListFiles,
	ToolReadFiles:      handleReadFiles,
	ToolAppendFile:     handleAppendFile,
	ToolPatchFile:      handlePatchTextFile,
	ToolGrep:           handleGrep,
	ToolBash:           handleBash,
	ToolAddTodo:        handleAddTodo,
	ToolMarkTodoAsDone: handleMarkTodoAsDone,
}
