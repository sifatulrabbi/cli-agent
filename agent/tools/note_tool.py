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
    with open(_base_path, "w") as f:
        if add:
            f.writelines(add)
        # TODO: handle updates
    return "Done"
