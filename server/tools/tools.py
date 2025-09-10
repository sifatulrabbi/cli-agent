from langchain_core.tools import tool
from pydantic import BaseModel, Field


class AppendFileInsert(BaseModel):
    insertAfter: int = Field(
        ..., description="The line number after which to insert the content."
    )
    content: str = Field(..., description="The content to insert")


class AppendFile(BaseModel):
    filePath: str = Field(..., description="The path of the file to insert into")
    inserts: list[AppendFileInsert]


@tool(
    "append_file",
    args_schema=AppendFile,
    description="Insert content into a text file in the project. Must provide the full path. (Note: the full path can be obtained by using the 'ls' tool.)",
)
def append_file_tool():
    return


class PatchFilePatch(BaseModel):
    startLine: int = Field(
        ..., description="The start line of the range to replace (1-based)"
    )
    endLine: int = Field(
        ..., description="The end line of the range to replace (1-based)"
    )
    content: str = Field(
        ...,
        description="Replacement content. Use empty string to delete the specified range.",
    )


class PatchFile(BaseModel):
    filePath: str = Field(..., description="The path of the file to patch")
    patches: list[PatchFilePatch]


@tool(
    "patch_file",
    args_schema=PatchFile,
    description=(
        "Patch a text file by replacing existing line ranges only. "
        "Insertion is not supported here; use 'append_file' for insertions. "
        "Must provide the full path (obtainable via 'ls' tool)."
    ),
)
def patch_file_tool():
    return


class GrepArgs(BaseModel):
    cmd: str = Field(
        ...,
        description=(
            "The command to run (e.g., grep -R -n 'pattern' .). "
            "No need to provide any exclude patterns."
        ),
    )


@tool(
    "grep",
    args_schema=GrepArgs,
    description="Perform a grep action using the unix grep tool.",
)
def grep_tool():
    return


class BashArgs(BaseModel):
    cmd: str = Field(
        ...,
        description=("Command with simple arguments (no pipes/redirects)."),
    )


@tool(
    "bash",
    args_schema=BashArgs,
    description=(
        "Execute a safe subset of bash commands within WorkingPath for listing, "
        "reading, creating, and removing files/dirs. Use relative paths; no pipes/redirects/subshells. "
        "For content edits, use append_file or patch_file. Return the command you want to run. "
        "No need to return 'bash -lc' or the 'bash' in the prefix. "
        "e.g., 'ls -R', 'tail -n 20 filename ', 'sed -n '10,20p' file.py'."
    ),
)
def bash_tool():
    return
