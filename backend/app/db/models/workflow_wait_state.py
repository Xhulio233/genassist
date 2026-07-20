from typing import Optional

from sqlalchemy import (
    String,
    Text,
    Integer,
    Index,
    Enum as SQLEnum,
    DateTime,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.core.utils.enums.workflow_wait_enum import WorkflowWaitStatus


class WorkflowWaitStateModel(Base):
    """A workflow execution suspended at a Wait/Delay node until ``resume_at``.

    Written when a Wait node pauses execution; swept by a Celery beat poller that
    resumes the workflow (re-entering the engine at ``wait_node_id`` for
    ``thread_id``) once ``resume_at`` has passed. The heavy resume context
    (node outputs + request context) lives in Redis conversation memory keyed by
    ``thread_id`` — this row only carries what the poller needs to find and
    re-dispatch the run.
    """

    __tablename__ = "workflow_wait_states"
    __table_args__ = (
        # The poller scans WAITING rows whose resume_at has passed.
        Index("idx_workflow_wait_states_status_resume_at", "status", "resume_at"),
        Index("idx_workflow_wait_states_thread_id", "thread_id"),
    )

    workflow_id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    thread_id: Mapped[str] = mapped_column(String(255), nullable=False)
    wait_node_id: Mapped[str] = mapped_column(String(255), nullable=False)
    resume_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[WorkflowWaitStatus] = mapped_column(
        SQLEnum(
            WorkflowWaitStatus,
            name="workflow_wait_status_enum",
            create_constraint=True,
        ),
        nullable=False,
        default=WorkflowWaitStatus.WAITING,
    )
    # Number of times the poller has claimed this row for resume (crash guard).
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    resumed_at: Mapped[Optional[DateTime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
