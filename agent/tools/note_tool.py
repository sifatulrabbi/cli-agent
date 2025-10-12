from pydantic import BaseModel, Field
from langchain_core.tools import tool


class UpdateNoteLineSchema(BaseModel):
    index: int = Field(..., description="The index of the line to update.")
    text: str | None = Field(
        ...,
        description="The new text to insert in the line. Return 'null' to remove the targeted line from the note.",
    )


class NoteToolArgsSchema(BaseModel):
    add: list[str] | None = Field(..., description="New lines to add to the notes.")
    update: list[UpdateNoteLineSchema] | None = Field(
        ..., description="Lines of the note to update / remove."
    )


@tool("note", description="Use this tool to manage your notes.")
def note_tool(args: NoteToolArgsSchema):
    pass
