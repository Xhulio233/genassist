"""
Wait / Delay node implementation using the BaseNode class.

Suspends workflow execution and resumes it later, n8n-style, rather than blocking
a worker. On first execution the node computes when to resume (a relative duration
or an absolute timestamp), persists the resume context (Redis) plus a durable,
queryable ``workflow_wait_states`` row, and raises ``WorkflowPausedException`` so the
run returns immediately with a "waiting" status. A Celery beat poller
(``app.tasks.workflow_wait_tasks``) later re-enters the engine at this node once the
time is up; on that resume the node restores the captured context and passes its
input through unchanged so downstream nodes continue.

The suspend/resume mechanism mirrors the Human-In-The-Loop node
(``human_in_the_loop_node.py``); the Redis context keys are namespaced per node so
they never collide with HITL's global ``paused_*`` keys.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from uuid import UUID

from app.modules.workflow.engine.base_node import BaseNode
from app.modules.workflow.engine.workflow_state import WorkflowPausedException

logger = logging.getLogger(__name__)

# Multipliers to convert a configured duration into seconds.
_UNIT_SECONDS = {
    "seconds": 1,
    "minutes": 60,
    "hours": 3600,
}

# Safety cap so a misconfigured node can never schedule a resume absurdly far out.
MAX_DELAY_SECONDS = 24 * 60 * 60  # 24 hours


def _outputs_key(node_id: str) -> str:
    return f"wait_paused_node_outputs:{node_id}"


def _context_key(node_id: str) -> str:
    return f"wait_paused_request_context:{node_id}"


class WaitDelayNode(BaseNode):
    """Suspends execution until a duration/timestamp, then passes input through."""

    async def process(self, config: Dict[str, Any]) -> Any:
        """
        Suspend on first execution; pass the input through on resume.

        Args:
            config: Resolved node configuration. `mode` selects the behaviour:
                "duration" (default) waits `duration` * `durationUnit`; "timestamp"
                waits until the `timestamp` (ISO 8601) is reached.

        Returns:
            On resume (or when no wait is needed), the output of the connected
            source node, unchanged. Otherwise raises WorkflowPausedException.
        """
        # Resume path: the beat poller re-entered the engine at this node.
        if self.state.initial_values.get("wait_resume_node_id") == self.node_id:
            return await self._resume()

        delay_seconds = self._resolve_delay_seconds(config)
        if delay_seconds > MAX_DELAY_SECONDS:
            logger.warning(
                "WaitDelayNode %s: requested delay %.0fs exceeds cap, clamping to %ds",
                self.node_id,
                delay_seconds,
                MAX_DELAY_SECONDS,
            )
            delay_seconds = MAX_DELAY_SECONDS

        if delay_seconds <= 0:
            logger.debug("WaitDelayNode %s: no wait required, passing through", self.node_id)
            return self.get_input_from_source()

        return await self._suspend(delay_seconds)

    async def _resume(self) -> Any:
        """Restore the context captured before the pause and pass input through."""
        paused_outputs = await self.get_memory().get_metadata(_outputs_key(self.node_id))
        if paused_outputs:
            self.get_state().node_outputs.update(paused_outputs)

        paused_context = await self.get_memory().get_metadata(_context_key(self.node_id))
        if paused_context:
            # A wait resume is a pure continuation (no new turn), so restore the
            # ORIGINAL message and inputs — unlike HITL, which drops the message
            # because the form submission is the turn. Only the resume-signal key
            # is dropped so it doesn't leak downstream.
            self.get_state().restore_resume_context(
                paused_context,
                drop_keys={"wait_resume_node_id"},
            )

        logger.info("WaitDelayNode %s: resumed, passing input through", self.node_id)
        return self.get_input_from_source()

    async def _suspend(self, delay_seconds: float) -> Any:
        """Snapshot resume context to Redis, record a durable wait row when the
        workflow is persisted, then pause the workflow.

        Two resume paths share this pause:
        - **Persisted workflow** (real UUID, e.g. saved/scheduled runs): a durable
          ``workflow_wait_states`` row is written so the background beat poller can
          resume it server-side once ``resume_at`` passes.
        - **Unsaved editor-test run** ("test-workflow"): no row is written — there
          is no saved workflow for a worker to reload — so the client drives the
          resume, re-invoking the workflow with the resume signal after the wait.

        Either way the node always suspends (raises) so downstream nodes never run
        before the wait is over.
        """
        resume_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        thread_id = self.get_state().thread_id

        # Snapshot node outputs + request context so the resume (a fresh state
        # starting at this node) continues as the same logical run. Mirrors HITL.
        # Done for both resume paths so upstream outputs survive the pause.
        await self.get_memory().set_metadata(
            _outputs_key(self.node_id), self.get_state().node_outputs
        )
        await self.get_memory().set_metadata(
            _context_key(self.node_id), self.get_state().capture_resume_context()
        )

        # Persisted workflow: record the durable, queryable wait the beat poller
        # resumes server-side. Skipped for unsaved test runs (client-driven).
        workflow_id = self._resumable_workflow_id()
        if workflow_id is not None:
            from app.dependencies.injector import injector
            from app.services.workflow_wait import WorkflowWaitService

            wait_service = injector.get(WorkflowWaitService)
            await wait_service.create_wait(
                workflow_id=workflow_id,
                thread_id=thread_id,
                wait_node_id=self.node_id,
                resume_at=resume_at,
            )

        logger.info(
            "WaitDelayNode %s: suspending until %s (server_resume=%s)",
            self.node_id,
            resume_at.isoformat(),
            workflow_id is not None,
        )
        raise WorkflowPausedException({
            "status": "waiting",
            "resume_at": resume_at.isoformat(),
            "wait_seconds": round(delay_seconds),
            "node_id": self.node_id,
            "thread_id": thread_id,
            "message": "Execution will continue when the wait time is over.",
        })

    def _resumable_workflow_id(self) -> UUID | None:
        """The workflow's persistent UUID, or None when it can't be resumed."""
        raw = self.get_state().workflow_id
        if not raw:
            return None
        try:
            return UUID(str(raw))
        except (ValueError, TypeError):
            return None

    def _resolve_delay_seconds(self, config: Dict[str, Any]) -> float:
        """Compute how many seconds to wait based on the configured mode."""
        mode = config.get("mode", "duration")

        if mode == "timestamp":
            return self._seconds_until_timestamp(config.get("timestamp"))

        return self._duration_seconds(config)

    def _duration_seconds(self, config: Dict[str, Any]) -> float:
        """Convert a relative duration + unit into seconds (never negative)."""
        try:
            amount = float(config.get("duration", 0) or 0)
        except (TypeError, ValueError):
            logger.warning(
                "WaitDelayNode %s: invalid duration %r, treating as 0",
                self.node_id,
                config.get("duration"),
            )
            return 0.0

        unit = config.get("durationUnit", "seconds")
        multiplier = _UNIT_SECONDS.get(unit, 1)
        return max(0.0, amount * multiplier)

    def _seconds_until_timestamp(self, raw_timestamp: Any) -> float:
        """Seconds from now until the given ISO timestamp (0 if empty/past/invalid)."""
        if not raw_timestamp:
            logger.warning("WaitDelayNode %s: no timestamp configured", self.node_id)
            return 0.0

        try:
            target = datetime.fromisoformat(str(raw_timestamp))
        except ValueError:
            logger.warning(
                "WaitDelayNode %s: invalid timestamp %r, skipping wait",
                self.node_id,
                raw_timestamp,
            )
            return 0.0

        # Compare using a matching awareness so naive and aware timestamps both work.
        now = datetime.now(target.tzinfo) if target.tzinfo else datetime.now()
        return max(0.0, (target - now).total_seconds())
