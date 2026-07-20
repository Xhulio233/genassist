import enum


class WorkflowWaitStatus(str, enum.Enum):
    """Lifecycle of a suspended Wait/Delay node execution.

    WAITING   -> persisted, waiting for resume_at to arrive
    RESUMING  -> claimed by the beat poller, resume task dispatched
    COMPLETED -> resume executed successfully
    FAILED    -> resume errored (or was reconciled after a crash)
    CANCELLED -> wait was cancelled before it could resume
    """

    WAITING = "waiting"
    RESUMING = "resuming"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
