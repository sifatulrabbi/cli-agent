import os
from typing import Annotated, TypedDict, cast
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    SystemMessage,
)
from langgraph.graph.state import RunnableConfig
from langgraph.prebuilt import create_react_agent
from langgraph.graph import END, StateGraph, add_messages, START
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from pydantic.types import SecretStr

from tools.bash_tool import bash_tool
from tools.note_tool import note_tool


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MAX_ITERATIONS = 10**10


class Plan(TypedDict):
    id: int  # Starts from 1
    task: str  # The full description of the task
    done: bool
    depends_on: list[int]  # List of task ids this task depends on.


class PlanItem(BaseModel):
    """A single plan item for the worker to execute"""

    id: int
    task: str
    done: bool
    depends_on: list[int]


class PlanList(BaseModel):
    """List of plan items"""

    plans: list[PlanItem]


def _add_plans(a: list[Plan], b: list[Plan]) -> list[Plan]:
    return b


class MultiStepAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    plan: Annotated[list[Plan], _add_plans]


CONTEXT_GATHERING_SYSTEM_PROMPT = """\
You are a specialized Context Gathering Agent. Your sole purpose is to thoroughly investigate and understand the user's request by gathering maximum context.

<workflow>
- Understand if the user's request requires context gathering and if you already have enough context in the <notes>.
- If the request is only greetings or you already have enough context then return immediately by replying "OK".
- Else start gathering by following the guidelines and using the available tools.
</workflow>

<primary_tasks>
1. **Explore exhaustively**: Use bash commands to explore the codebase, read files, check directory structures, understand dependencies, and analyze configurations
2. **Document everything**: Write down all discovered context in notes using the note tool - include file structures, key code patterns, dependencies, configurations, and any relevant information
3. **Be thorough**: Don't stop until you have a comprehensive understanding of:
   - The current state of the project
   - Relevant files and their purposes
   - Dependencies and their versions
   - Configuration files
   - Any patterns or conventions used
   - Potential challenges or constraints
4. **Handover:** Produce a final handover note for the next agent who will be using your gathered context and perform the task asked by the user.
</primary_tasks>

<tools_policy>
- `bash`: Execute bash commands to explore the filesystem, read files, check git status, etc.
- `note`: Write down discovered context. Use the 'add' parameter with a list of strings to document findings.
</tools_policy>

<tool_preambles>
- Before calling tools or executing your context search plan tell the user what you are about to do in a sentence or two.
</tool_preambles>

---

<notes>
{notes}
</notes>
""".strip()

PLANNER_AGENT_PROMPT = """\
You are a specialized Planning Agent. Your role is to create high-quality, detailed execution plans for completing the user's request.

<workflow>
1. Review the user's request and all gathered context from notes
2. Break down the task into logical, manageable steps
3. Create a comprehensive plan with clear dependencies
4. Each plan item should be actionable and have a clear success criteria
</workflow>

<planning_guidelines>
- **Be specific**: Each task should clearly describe what needs to be done and what the expected outcome is
- **Consider dependencies**: Identify which tasks depend on others and mark dependencies explicitly
- **Be comprehensive**: Cover all aspects of the user's request
- **Think sequentially**: Some tasks must be done before others (e.g., reading files before editing them)
- **Break down complexity**: Large tasks should be broken into smaller, focused subtasks
- **Include validation**: Consider adding tasks for testing or verification when appropriate
</planning_guidelines>

<plan_structure>
Each plan item should include:
- **id**: A unique identifier starting from 1
- **task**: A detailed description of what needs to be done, including:
  - The specific action to take
  - The expected outcome
  - Any relevant file paths or code locations
  - Success criteria
- **done**: Set to false initially
- **depends_on**: List of task IDs that must be completed first
</plan_structure>

<tools_policy>
- `bash`: Use to explore the codebase if you need additional context beyond what's in notes
- `note`: Use to add important planning notes or clarifications for workers
</tools_policy>

<output_format>
You must return a structured list of Plan items that will be executed by worker agents.
</output_format>

---

<notes>
{notes}
</notes>
""".strip()

WORKER_AGENT_PROMPT = """\
You are a specialized Worker Agent focused on completing coding tasks with high quality and precision.

<role>
You will be assigned specific tasks from a larger plan. Your job is to:
1. Execute the assigned task completely and correctly
2. Follow coding best practices
3. Write a handover note documenting what you accomplished
</role>

<workflow>
1. Read and understand your assigned task from the plan
2. Review relevant context from notes
3. Execute the task using available tools
4. Verify your work is correct
5. Write a comprehensive handover note documenting your changes
</workflow>

<coding_best_practices>
- **Read before writing**: Always read files before editing to understand the current state
- **Preserve code style**: Match existing formatting, naming conventions, and patterns
- **Be precise**: Make targeted changes without unnecessary modifications
- **Test your changes**: Verify that your code works as expected when possible
- **Handle errors**: Consider edge cases and error conditions
- **Write clean code**: Use clear variable names, add comments for complex logic
- **Avoid breaking changes**: Be mindful of dependencies and existing functionality
- **Type safety**: Use proper type hints and maintain type consistency
- **DRY principle**: Don't repeat yourself - reuse existing code when appropriate
</coding_best_practices>

<tools_policy>
- `bash`: Use for file operations, running tests, checking git status, or any terminal commands
- `note`: REQUIRED - Use to write handover notes when you complete your task
</tools_policy>

<handover_note_requirements>
After completing your task, you MUST write a handover note that includes:
- Summary of what you accomplished
- Files that were created or modified
- Any important decisions or trade-offs made
- Issues encountered and how they were resolved
- Any follow-up items or considerations for future tasks
- How to verify the changes work correctly
</handover_note_requirements>

<task_completion>
Mark your assigned task as done only after:
1. The task is fully implemented
2. You've verified it works correctly
3. You've written a comprehensive handover note
</task_completion>

---

<current_task>
{current_task}
</current_task>

<notes>
{notes}
</notes>
""".strip()

_default_config = RunnableConfig(recursion_limit=10**10)


async def _gather_context_node(state: MultiStepAgentState):
    print("\n=== Context Gathering Agent ===")
    agent = create_react_agent(
        model=ChatOpenAI(
            api_key=SecretStr(OPENAI_API_KEY),
            # api_key=SecretStr(OPENROUTER_API_KEY),
            # base_url=OPENROUTER_BASE_URL,
            model="gpt-5-mini",
            reasoning_effort="low",
        ),
        tools=[bash_tool, note_tool],
        prompt=CONTEXT_GATHERING_SYSTEM_PROMPT,
    )
    result = await agent.ainvoke(
        {"messages": state["messages"]},
        _default_config,
    )

    # Print agent's responses
    for msg in result["messages"]:
        if hasattr(msg, "content") and msg.content:
            print(f"\n[Context Agent]: {msg.content}")
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tool_call in msg.tool_calls:
                print(
                    f"\n[Tool Call]: {tool_call['name']} - {tool_call.get('args', {})}"
                )

    return {"messages": [result["messages"][-1]]}


async def _planner_node(state: MultiStepAgentState):
    print("\n=== Planning Agent ===")

    # Read notes
    notes_path = "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md"
    notes_content = ""
    try:
        with open(notes_path, "r") as f:
            notes_content = f.read()
    except FileNotFoundError:
        notes_content = "No notes available."

    # Create model with structured output
    model = ChatOpenAI(
        api_key=SecretStr(OPENAI_API_KEY),
        # api_key=SecretStr(OPENROUTER_API_KEY),
        # base_url=OPENROUTER_BASE_URL,
        model="gpt-5-mini",
        reasoning_effort="medium",
    ).with_structured_output(PlanList)

    # Format prompt with notes
    system_prompt = PLANNER_AGENT_PROMPT.format(notes=notes_content)

    # Get user message
    user_message = state["messages"][-1].content if state["messages"] else ""

    # Invoke model
    result = await model.ainvoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=user_message)]
    )
    result = cast(PlanList, result)

    # Print the generated plan
    print(f"\n[Planner]: Generated {len(result.plans)} tasks")
    for plan_item in result.plans:
        print(f"  Task {plan_item.id}: {plan_item.task}")
        if plan_item.depends_on:
            print(f"    Depends on: {plan_item.depends_on}")

    # Convert PlanItem to Plan (TypedDict)
    plans = [
        Plan(id=item.id, task=item.task, done=False, depends_on=item.depends_on)
        for item in result.plans
    ]

    return {"plan": plans}


async def _worker_node(state: MultiStepAgentState):
    print("\n=== Worker Agent ===")

    # Read notes
    notes_path = "/Users/sifatul/coding/cli-agent/agent/tmp/cli-agent-notes.md"
    notes_content = ""
    try:
        with open(notes_path, "r") as f:
            notes_content = f.read()
    except FileNotFoundError:
        notes_content = "No notes available."

    # Find the next task to execute (not done and all dependencies are done)
    current_task = None
    for plan in state["plan"]:
        if plan["done"]:
            continue

        # Check if all dependencies are satisfied
        dependencies_satisfied = True
        for dep_id in plan["depends_on"]:
            # Find the dependency
            dep_task = next((p for p in state["plan"] if p["id"] == dep_id), None)
            if dep_task and not dep_task["done"]:
                dependencies_satisfied = False
                break

        if dependencies_satisfied:
            current_task = plan
            break

    if not current_task:
        print("[Worker]: No task to execute")
        return {}

    print(f"\n[Worker]: Executing Task {current_task['id']}: {current_task['task']}")

    # Create worker agent
    agent = create_react_agent(
        model=ChatOpenAI(
            api_key=SecretStr(OPENAI_API_KEY),
            # api_key=SecretStr(OPENROUTER_API_KEY),
            # base_url=OPENROUTER_BASE_URL,
            model="gpt-5-mini",
            reasoning_effort="medium",
        ),
        tools=[bash_tool, note_tool],
        prompt=WORKER_AGENT_PROMPT.format(
            current_task=current_task["task"], notes=notes_content
        ),
    )

    # Execute the task
    result = await agent.ainvoke(
        {"messages": state["messages"]},
        _default_config,
    )

    # Print agent's responses
    for msg in result["messages"]:
        if hasattr(msg, "content") and msg.content:
            print(f"\n[Worker]: {msg.content}")
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tool_call in msg.tool_calls:
                print(
                    f"\n[Tool Call]: {tool_call['name']} - {tool_call.get('args', {})}"
                )

    # Mark the task as done
    updated_plans = []
    for plan in state["plan"]:
        if plan["id"] == current_task["id"]:
            updated_plan = plan.copy()
            updated_plan["done"] = True
            updated_plans.append(updated_plan)
            print(f"\n[Worker]: Task {plan['id']} marked as complete")
        else:
            updated_plans.append(plan)

    return {"plan": updated_plans, "messages": [result["messages"][-1]]}


def remaining_plans_condition(state: MultiStepAgentState):
    remaining_plan = False
    for plan in state["plan"]:
        if not plan["done"]:
            remaining_plan = True
            break
    return "worker" if remaining_plan else END


_graph_builder = StateGraph(MultiStepAgentState)

_graph_builder.add_node("gather_context", _gather_context_node)
_graph_builder.add_node("planner", _planner_node)
_graph_builder.add_node("worker", _worker_node)

_graph_builder.add_edge(START, "gather_context")
_graph_builder.add_edge("gather_context", "planner")
_graph_builder.add_edge("planner", "worker")
_graph_builder.add_conditional_edges("worker", remaining_plans_condition)

_graph = _graph_builder.compile()


async def multi_step_agent(user_msg: str):
    result = await _graph.ainvoke(
        {"messages": [HumanMessage(content=user_msg)], "plan": []},
        _default_config,
    )
    return result
