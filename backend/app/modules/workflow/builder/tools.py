"""
The tools the Workflow Builder agent uses to read and change a workflow draft.

Each tool is a thin wrapper over ``WorkflowDraft``: load the draft for the
conversation, apply one operation, save, and return a short text result. A
failed operation changes nothing and returns the reason, so the agent can
correct itself in the same turn.
"""

import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.modules.workflow.builder import catalog, patterns
from app.modules.workflow.builder.draft import DraftError, WorkflowDraft, load_draft, save_draft
from app.modules.workflow.builder.resources import describe_resources
from app.modules.workflow.builder.testing import (
    error_signature,
    run_draft_test,
    test_found_code_error,
    test_was_attempted,
)

# A fix-and-retest loop on one error burns a model call per attempt and rarely converges.
MAX_SAME_FAILURE = 3
MAX_FAILED_TESTS = 5

logger = logging.getLogger(__name__)

# One lock per conversation: an agent may issue several tool calls at once, and
# each call is a read-modify-write of the same draft.
_locks: Dict[str, asyncio.Lock] = {}


def _lock_for(thread_id: str) -> asyncio.Lock:
    lock = _locks.get(thread_id)
    if lock is None:
        lock = _locks[thread_id] = asyncio.Lock()
    return lock


def _param(kind: str, description: str, required: bool = True) -> Dict[str, Any]:
    return {"type": kind, "description": description, "required": required}


_NODE_ID = "Node id from the workflow outline, e.g. \"n3\"."

# Structured arguments are declared as JSON text, not as free-form objects: a tool
# schema cannot describe an object whose keys depend on the node type, and models
# tend to leave such undescribed objects empty. Both forms are accepted when parsed.
_CONFIG_JSON = (
    "A JSON object as text, mapping config field to value, e.g. "
    "{\"matchMode\": \"contains\", \"limit\": 5}. "
)

TOOL_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "name": "get_workflow",
        "description": (
            "Return the current workflow as a compact outline: every node with its id, type, name and "
            "non-default config, every connection, and any open issues. Call this first on every turn."
        ),
        "parameters": {},
    },
    {
        "name": "get_node",
        "description": "Return one node's full config (including long prompts and code) and its connections.",
        "parameters": {"node_id": _param("string", _NODE_ID)},
    },
    {
        "name": "search_nodes",
        "description": (
            "Find node types by what they do. Returns up to five matches with their type name, purpose "
            "and handles. Use it whenever you are not sure which node type fits."
        ),
        "parameters": {"query": _param("string", "Keywords, e.g. \"send slack message\" or \"branch on value\".")},
    },
    {
        "name": "get_node_schema",
        "description": (
            "Return one node type's config fields (with defaults and allowed values), handles and usage "
            "rules. Call it before adding or configuring a node type you have not used in this conversation."
        ),
        "parameters": {"node_type": _param("string", "Exact node type, e.g. \"switchNode\".")},
    },
    {
        "name": "get_pattern",
        "description": (
            "Return a proven recipe (the exact tool calls) for a common workflow shape. Call with no name "
            "to list the available patterns."
        ),
        "parameters": {"name": _param("string", "Pattern name; omit to list them.", required=False)},
    },
    {
        "name": "list_resources",
        "description": (
            "List what exists in this workspace that a node can use: knowledge bases, integrations "
            "(Zendesk, Slack, WhatsApp, Salesforce, Jira connections) or data sources (Gmail, Calendar, "
            "databases). Returns names and ids. Use it whenever the person refers to one by name, and "
            "before adding a knowledge base or integration node, so you can set it instead of leaving "
            "it for them."
        ),
        "parameters": {
            "kind": _param("string", "One of: knowledge_bases, integrations, data_sources."),
        },
    },
    {
        "name": "add_node",
        "description": (
            "Add a node to the main flow. Optionally connect it in the same call: connect_from is the "
            "node that feeds it, connect_to the node it feeds. Giving both inserts it between two nodes. "
            "Not for agent tools: use add_tool for those."
        ),
        "parameters": {
            "node_type": _param("string", "Exact node type, e.g. \"agentNode\"."),
            "name": _param("string", "Short human-readable name shown on the canvas."),
            "system_prompt": _param(
                "string",
                "For agentNode, subAgentNode and llmModelNode: the full system prompt, as plain text. "
                "Always pass it when adding one of those nodes.",
                required=False,
            ),
            "config": _param("string", _CONFIG_JSON + "Other config fields to set. Omit to keep defaults.", required=False),
            "connect_from": _param("string", "Upstream node: \"n2\", or \"n2.output_true\" to pick a specific output.", required=False),
            "connect_to": _param("string", "Downstream node id.", required=False),
        },
    },
    {
        "name": "add_tool",
        "description": (
            "Give an agent a tool. Creates the Tool Builder, the node it runs, and both connections in one "
            "step. Use this for knowledge bases, integrations, API calls or code the agent should be able to call."
        ),
        "parameters": {
            "agent_id": _param("string", "The agent node that gets the tool, e.g. \"n2\"."),
            "node_type": _param("string", "Node type the tool runs, e.g. \"knowledgeBaseNode\", \"zendeskTicketNode\"."),
            "name": _param("string", "Tool name the agent sees, e.g. \"Search Docs\"."),
            "description": _param("string", "When the agent should call this tool."),
            "config": _param("string", _CONFIG_JSON + "Config for the node the tool runs.", required=False),
            "parameters": _param(
                "string",
                "A JSON object as text: the arguments the agent passes when calling the tool, as "
                "{\"name\": \"description\"}. Read each one in the node's config as {{source.<name>}}.",
                required=False,
            ),
        },
    },
    {
        "name": "set_node_field",
        "description": (
            "Set one config field of a node. This is the way to write or rewrite a system prompt, a "
            "template, code or any other long text: the value is passed as plain text, exactly as it "
            "should be stored. Also works for any single setting."
        ),
        "parameters": {
            "node_id": _param("string", _NODE_ID),
            "field": _param("string", "Config field name, e.g. \"systemPrompt\", \"template\", \"code\"."),
            "value": _param(
                "string",
                "The new value. Text fields: the text itself. Other fields: JSON, e.g. true, 5 or [\"a\"].",
            ),
        },
    },
    {
        "name": "update_node",
        "description": (
            "Change several config fields and/or the name of a node in one call. Only the fields you pass "
            "change. For a Switch, passing `cases` recomputes its output handles. For a single long text "
            "field prefer set_node_field."
        ),
        "parameters": {
            "node_id": _param("string", _NODE_ID),
            "config": _param("string", _CONFIG_JSON + "The fields to change.", required=False),
            "name": _param("string", "New name.", required=False),
        },
    },
    {
        "name": "remove_node",
        "description": "Remove a node and its connections. Removing a tool also removes the node it runs.",
        "parameters": {"node_id": _param("string", _NODE_ID)},
    },
    {
        "name": "connect",
        "description": (
            "Connect two existing nodes. Handles are inferred when there is only one choice; for a node "
            "with several outputs (router, switch) name the output, e.g. source=\"n3.output_case_1\"."
        ),
        "parameters": {
            "source": _param("string", "Upstream node: \"n3\" or \"n3.output_true\"."),
            "target": _param("string", "Downstream node id."),
        },
    },
    {
        "name": "disconnect",
        "description": "Remove the connection between two nodes.",
        "parameters": {
            "source": _param("string", "Upstream node: \"n3\" or \"n3.output_true\"."),
            "target": _param("string", "Downstream node id."),
        },
    },
    {
        "name": "test_workflow",
        "description": (
            "Run the workflow once with a user message and see what the canvas shows under Response, "
            "Debug and Execution: the reply, every node that ran with its output or error, the tool "
            "calls agents made, and the nodes that did not run. Use it to confirm the workflow does "
            "what was asked. This is a real run: if an agent decides to call a tool that sends or "
            "creates something (an email, a ticket, a message), that really happens."
        ),
        "parameters": {
            "message": _param("string", "The user message to run the workflow with."),
        },
    },
    {
        "name": "get_last_test_run",
        "description": (
            "Show the person's own most recent test run of this workflow on the canvas: their input, the "
            "response they got, each step with its output or error, and the tool calls. Call it when "
            "they say something is not working, so you see what they saw without them pasting a log."
        ),
        "parameters": {},
    },
    {
        "name": "finalize_workflow",
        "description": (
            "Validate the workflow and mark your changes complete. Call it once at the end of every turn in "
            "which you changed the workflow. It fails with the list of errors to fix if the workflow is invalid."
        ),
        "parameters": {
            "summary": _param("string", "One sentence describing what was built or changed.", required=False),
        },
    },
]

TOOL_NAMES = [tool["name"] for tool in TOOL_DEFINITIONS]

# Tools that only read; they never create a draft or bump its revision.
_READ_ONLY = {
    "get_workflow", "get_node", "search_nodes", "get_node_schema", "get_pattern", "test_workflow",
    "list_resources", "get_last_test_run",
}


def _search_nodes(query: str) -> str:
    matches = catalog.search_nodes(query)
    if not matches:
        return f"No node type matches '{query}'. Node types:\n{catalog.compact_index()}"
    return "\n".join(
        f"{m['type']} ({m['label']}) — {m['description']} Handles ({m['handles']})" for m in matches
    )


def _apply(draft: WorkflowDraft, name: str, args: Dict[str, Any]) -> str:
    if name == "get_workflow":
        return draft.render_outline()
    if name == "get_last_test_run":
        return draft.last_user_test or (
            "The person has not test-run this workflow on the canvas in this session. Use test_workflow "
            "to run it yourself with the message they describe."
        )
    if name == "get_node":
        return draft.render_node(args.get("node_id"))
    if name == "add_node":
        return draft.add_node(
            args.get("node_type"), args.get("name"), args.get("config"),
            args.get("connect_from"), args.get("connect_to"), args.get("system_prompt"),
        )["message"]
    if name == "add_tool":
        return draft.add_tool(
            args.get("agent_id"), args.get("node_type"), args.get("name") or "Tool",
            args.get("description"), args.get("config"), args.get("parameters"),
        )["message"]
    if name == "set_node_field":
        return draft.set_field(args.get("node_id"), args.get("field"), args.get("value"))["message"]
    if name == "update_node":
        return draft.update_node(args.get("node_id"), args.get("config"), args.get("name"))["message"]
    if name == "remove_node":
        return draft.remove_node(args.get("node_id"))["message"]
    if name == "connect":
        return draft.connect(
            args.get("source"), args.get("target"), args.get("source_handle"), args.get("target_handle")
        )["message"]
    if name == "disconnect":
        return draft.disconnect(args.get("source"), args.get("target"), args.get("source_handle"))["message"]
    if name == "finalize_workflow":
        return draft.finalize(args.get("summary") or "")["message"]
    raise DraftError(f"Unknown tool '{name}'.")


async def run_tool(
    thread_id: str,
    name: str,
    args: Dict[str, Any],
    usage_sink: Optional[list] = None,
) -> str:
    """
    Execute one builder tool for a conversation and return its text result.

    ``usage_sink`` collects the LLM usage of a test run, so it is accounted to
    the builder conversation that asked for it.
    """
    args = {k: v for k, v in (args or {}).items() if v is not None}

    # Catalog lookups do not touch the draft.
    if name == "search_nodes":
        return _search_nodes(str(args.get("query", "")))
    if name == "get_node_schema":
        return catalog.node_schema_text(str(args.get("node_type", "")).strip())
    if name == "get_pattern":
        return patterns.describe(args.get("name"))

    if name == "list_resources":
        draft = await load_draft(thread_id)
        if draft is None or not draft.authenticated:
            return (
                "Resources can only be looked up once the person is signed in and working on the canvas. "
                "Leave the field unset and tell them what they will need to select."
            )
        return await describe_resources(str(args.get("kind", "")))

    if name == "test_workflow":
        # Outside the lock: a run can take a while and must not block other tool calls.
        draft = await load_draft(thread_id) or WorkflowDraft()
        if draft.failed_tests >= MAX_FAILED_TESTS:
            return (
                f"STOP: {draft.failed_tests} test runs in a row have failed, so no more runs are allowed "
                f"this turn. Do not change anything else. Reply to the person now: say plainly that the "
                f"workflow is not working yet, what the error is, and what you would try next."
            )
        result = await run_draft_test(draft, str(args.get("message", "")), usage_sink=usage_sink)
        if test_was_attempted(result):
            failure = error_signature(result)
            async with _lock_for(thread_id):
                latest = await load_draft(thread_id)
                if latest is not None:
                    if failure:
                        latest.failed_tests += 1
                        latest.same_failure_count = (
                            latest.same_failure_count + 1 if failure == latest.last_failure else 1
                        )
                        latest.last_failure = failure
                    else:
                        latest.failed_tests = latest.same_failure_count = 0
                        latest.last_failure = ""
                    # Only a run of the workflow as it still is, without a bug in a code step,
                    # counts as its test.
                    if latest.revision == draft.revision and not test_found_code_error(result):
                        latest.needs_test = False
                    await save_draft(thread_id, latest)
                    if failure and latest.same_failure_count >= MAX_SAME_FAILURE:
                        result += (
                            f"\nSTOP AND RETHINK: this is the same failure {latest.same_failure_count} times "
                            f"in a row, so your fixes are not addressing its cause. Do not send another "
                            f"variation of the same code. Either change the approach (a different kind of "
                            f"step, usually a language model step when the input is free text), or stop and "
                            f"tell the person what is failing."
                        )
        return result

    async with _lock_for(thread_id):
        draft = await load_draft(thread_id) or WorkflowDraft()
        try:
            result = _apply(draft, name, args)
        except DraftError as exc:
            return f"ERROR: {exc}"
        if name not in _READ_ONLY:
            await save_draft(thread_id, draft)
            if name != "finalize_workflow":
                result = f"{result}\n{draft.open_problems()}"
        return result


def make_executor(
    thread_id_getter: Callable[[], str],
    name: str,
    usage_sink_getter: Optional[Callable[[], Optional[list]]] = None,
) -> Callable[[Dict[str, Any]], Awaitable[str]]:
    """Adapt ``run_tool`` to the ``function({"parameters": {...}})`` shape agent tools use."""

    async def execute(input_data: Dict[str, Any]) -> str:
        parameters = (input_data or {}).get("parameters") or {}
        try:
            usage_sink = usage_sink_getter() if usage_sink_getter else None
            return await run_tool(thread_id_getter(), name, parameters, usage_sink=usage_sink)
        except Exception as exc:  # never let a tool crash the agent loop
            logger.error("Workflow builder tool '%s' failed: %s", name, exc, exc_info=True)
            return json.dumps({"error": f"{name} failed unexpectedly: {exc}"})

    return execute
