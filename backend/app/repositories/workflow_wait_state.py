import logging
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone

from injector import inject
from sqlalchemy import and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.exceptions.error_messages import ErrorKey
from app.core.exceptions.exception_classes import AppException
from app.core.utils.enums.workflow_wait_enum import WorkflowWaitStatus
from app.db.models.workflow_wait_state import WorkflowWaitStateModel
from app.repositories.db_repository import DbRepository

logger = logging.getLogger(__name__)


@inject
class WorkflowWaitStateRepository(DbRepository[WorkflowWaitStateModel]):
    """Repository for suspended Wait/Delay node executions."""

    def __init__(self, db: AsyncSession):
        super().__init__(WorkflowWaitStateModel, db)

    async def create(
        self,
        workflow_id: UUID,
        thread_id: str,
        wait_node_id: str,
        resume_at: datetime,
    ) -> WorkflowWaitStateModel:
        wait = WorkflowWaitStateModel(
            workflow_id=workflow_id,
            thread_id=thread_id,
            wait_node_id=wait_node_id,
            resume_at=resume_at,
            status=WorkflowWaitStatus.WAITING,
        )
        return await super().create(wait)

    async def get_by_id(self, wait_id: UUID) -> WorkflowWaitStateModel:
        wait = await super().get_by_id(wait_id)
        if not wait:
            raise AppException(error_key=ErrorKey.NOT_FOUND)
        return wait

    async def claim_due(self, now: datetime, limit: int = 100) -> List[UUID]:
        """Atomically claim WAITING rows whose resume_at has passed.

        A single UPDATE flips WAITING -> RESUMING and returns the claimed ids, so
        two concurrent beat ticks can never dispatch the same wait twice. The inner
        SELECT ... FOR UPDATE SKIP LOCKED bounds the batch and skips rows another
        worker is already claiming.
        """
        due_ids = (
            select(WorkflowWaitStateModel.id)
            .where(
                WorkflowWaitStateModel.is_deleted == 0,
                WorkflowWaitStateModel.status == WorkflowWaitStatus.WAITING,
                WorkflowWaitStateModel.resume_at <= now,
            )
            .order_by(WorkflowWaitStateModel.resume_at.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        stmt = (
            update(WorkflowWaitStateModel)
            .where(WorkflowWaitStateModel.id.in_(due_ids))
            .values(
                status=WorkflowWaitStatus.RESUMING,
                attempts=WorkflowWaitStateModel.attempts + 1,
            )
            .returning(WorkflowWaitStateModel.id)
            .execution_options(synchronize_session=False)
        )
        result = await self.db.execute(stmt)
        ids = [row[0] for row in result.all()]
        await self.db.commit()
        return ids

    async def mark_status(
        self,
        wait_id: UUID,
        status: WorkflowWaitStatus,
        error_message: Optional[str] = None,
    ) -> WorkflowWaitStateModel:
        wait = await self.get_by_id(wait_id)
        wait.status = status
        if status == WorkflowWaitStatus.COMPLETED and not wait.resumed_at:
            wait.resumed_at = datetime.now(timezone.utc)
        if error_message is not None:
            wait.error_message = error_message
        return await super().update(wait)

    async def mark_stuck_as_failed(
        self, stuck_before: datetime, error_message: str
    ) -> int:
        """Fail waits orphaned by a crash: still WAITING or RESUMING well after
        their resume_at should have fired. Mirrors the conservative schedule-run
        reconciler — mark FAILED, never blindly re-dispatch (a partially-resumed
        run may already have caused downstream side effects)."""
        stmt = (
            update(WorkflowWaitStateModel)
            .where(
                WorkflowWaitStateModel.is_deleted == 0,
                WorkflowWaitStateModel.resume_at < stuck_before,
                or_(
                    WorkflowWaitStateModel.status == WorkflowWaitStatus.WAITING,
                    WorkflowWaitStateModel.status == WorkflowWaitStatus.RESUMING,
                ),
            )
            .values(
                status=WorkflowWaitStatus.FAILED,
                error_message=error_message,
            )
            .execution_options(synchronize_session=False)
        )
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount or 0
