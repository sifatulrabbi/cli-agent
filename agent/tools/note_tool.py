from typing import Any, List, Optional
from pydantic import BaseModel, Field
from langchain_core.tools import tool

_base_path = "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md"


class UpdateNoteLineSchema(BaseModel):
    index: int = Field(..., description="The index of the line to update.")
    text: Optional[str] = Field(
        None,
        description="The new text to insert in the line. Return 'null' to remove the targeted line from the note.",
    )


class NoteToolArgsSchema(BaseModel):
    add: Optional[List[str]] = Field(
        [], description="An array containing new lines to add to the note."
    )
    update: Optional[List[UpdateNoteLineSchema]] = Field(
        [],
        description="An array containing note line updates or note line removals.",
    )


@tool(
    "note",
    args_schema=NoteToolArgsSchema,
    description="Use this tool to manage your notes.",
)
def note_tool(add: list[str] | None = None, update: list[dict[str, Any]] | None = None):
    print("note_tool:", add, update)

    with open(_base_path, "r") as f:
        lines = f.readlines()

    if update and len(update) > 0:
        for u in update:
            if u["index"] >= len(lines):
                continue
            if not u["text"]:
                lines = [*lines[: (u["index"])], *lines[u["index"] + 1 :]]
            else:
                lines[u["index"]] = u["text"]
    if add and len(add) > 0:
        [lines.append(line) for line in add]

    with open(_base_path, "w") as f:
        f.write("\n".join(lines))

    return "Done"
