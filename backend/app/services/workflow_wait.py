"""Business logic for suspended Wait/Delay node executions.

A Wait node calls :meth:`WorkflowWaitService.create_wait` when it pauses; the
Celery beat poller (``app.tasks.workflow_wait_tasks``) later claims due rows and
resumes the workflow.
"""

import logging
from datetime import datetime
from uuid import UUID

from injector import inject

from app.repositories.workflow_wait_state import WorkflowWaitStateRepository
from app.db.models.workflow_wait_state import WorkflowWaitStateModel

logger = logging.getLogger(__name__)


@inject
class WorkflowWaitService:
    """Create and manage suspended Wait/Delay executions."""

    def __init__(self, wait_repository: WorkflowWaitStateRepository):
        self.wait_repository = wait_repository

    async def create_wait(
        self,
        workflow_id: UUID,
        thread_id: str,
        wait_node_id: str,
        resume_at: datetime,
    ) -> WorkflowWaitStateModel:
        """Persist a suspended wait to be resumed once resume_at passes."""
        wait = await self.wait_repository.create(
            workflow_id=workflow_id,
            thread_id=thread_id,
            wait_node_id=wait_node_id,
            resume_at=resume_at,
        )
        logger.info(
            "Created workflow wait %s for node %s (thread %s), resume_at=%s",
            wait.id,
            wait_node_id,
            thread_id,
            resume_at.isoformat(),
        )
        return wait
