import os
import json
from configs import TODO_DATA_DIR


def working_path_to_todo_record_name(working_path: str):
    return working_path.replace("/", "-", -1)


def get_todo_file_name(working_path: str):
    todo_record = working_path_to_todo_record_name(working_path)
    fullpath = os.path.join(TODO_DATA_DIR, f"./{todo_record}")
    if not os.path.exists(fullpath):
        with open(fullpath, "w") as f:
            f.write("[]")
    return todo_record


def get_existing_todos_for_ai(working_path: str) -> str:
    """
    Todos are saved per working path so that agent can have a synchronized todo
    for the working directory regardless of the restarts.
    """
    filename = get_todo_file_name(working_path)
    with open(filename, "r") as f:
        content: list[dict] = json.loads(f.read())
    formatted = ""
    if len(content) < 1:
        return formatted
    formatted = "<current_todo_list>\n"
    for i, todo in enumerate(content):
        if todo.get("done", False):
            formatted = formatted + "[x] "
        else:
            formatted = formatted + "[ ] "
        formatted = formatted + f"{i+1}. "
        formatted = formatted + todo.get("task", "")
        pass
    formatted = formatted + "\n</current_todo_list>"
    return formatted


def add_todo(working_path: str, todos: list[dict]):
    filename = get_todo_file_name(working_path)
    with open(filename, "r") as f:
        existing_content: list[dict] = json.loads(f.read())
        for i, todo in enumerate(todos):
            existing_content.append(
                {
                    "id": len(existing_content) + (i + 1),
                    "task": todo.get("task", ""),
                    "done": False,
                }
            )
        json.dump(existing_content, f, indent=2)


def mark_todo_as_done(working_path: str, todos_ids: list[int]):
    filename = get_todo_file_name(working_path)
    with open(filename, "r") as f:
        existing_content: list[dict] = json.loads(f.read())
        for id in todos_ids:
            for todo in existing_content:
                if todo.get("id") == id:
                    todo["done"] = True
        json.dump(existing_content, f, indent=2)
