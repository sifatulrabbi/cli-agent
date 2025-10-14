import asyncio
from note_tool import note_tool


async def test_note_tool():
    await note_tool.ainvoke(
        {
            "add": [
                "Found issues in src/App.jsx: - localStorage JSON.parse not wrapped in try/catch (can crash on malformed data). - setTodos uses non-functional updates (race conditions possible). - submitEdit returns on empty trimmed text but doesn't exit editing mode (UX bug). - createdAt field is stored but unused. - accessibility: missing aria-labels and better keyboard support. - minor: Date.now() ids could collide; consider uuid. Suggestions: wrap JSON.parse, use functional updates, handle empty edits by deleting or cancelling, add ARIA labels, optionally persist filter."
            ],
            "update": None,
        }
    )


if __name__ == "__main__":
    asyncio.run(test_note_tool())
