"""
Celery tasks for resuming Wait/Delay node executions.

Mirrors the scheduled-workflow pattern: a beat task fires every minute, claims
``workflow_wait_states`` rows whose ``resume_at`` has passed (WAITING -> RESUMING),
and dispatches a resume task per claimed wait. The resume task re-enters the
workflow engine at the wait node for the paused thread, so downstream nodes
continue exactly where they left off.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from celery import shared_task

from app.core.config.settings import settings
from app.core.exceptions.error_messages import ErrorKey
from app.core.exceptions.exception_classes import AppException
from app.core.tenant_scope import get_tenant_context
from app.core.utils.enums.workflow_wait_enum import WorkflowWaitStatus
from app.db.multi_tenant_session import multi_tenant_manager
from app.modules.workflow.engine.workflow_engine import WorkflowEngine
from app.repositories.workflow import WorkflowRepository
from app.repositories.workflow_wait_state import WorkflowWaitStateRepository
from app.tasks.base import run_async_in_celery

logger = logging.getLogger(__name__)


# ==================== Resume ====================

async def resume_workflow_wait_async(wait_id: UUID):
    """Resume a single suspended Wait execution for the current tenant."""
    tenant_id = get_tenant_context()
    session_factory = multi_tenant_manager.get_tenant_session_factory(tenant_id)

    async with session_factory() as session:
        try:
            wait_repository = WorkflowWaitStateRepository(session)
            workflow_repository = WorkflowRepository(session)

            # If the wait row doesn't exist in this tenant's DB, this isn't our
            # tenant (resume runs across all tenants).
            try:
                wait = await wait_repository.get_by_id(wait_id)
            except AppException as e:
                if e.error_key == ErrorKey.NOT_FOUND:
                    logger.debug(
                        f"Workflow wait {wait_id} not found in tenant "
                        f"{tenant_id}, skipping resume"
                    )
                    return None
                raise

            try:
                workflow = await workflow_repository.get_by_id(wait.workflow_id)
                if not workflow:
                    raise Exception(f"Workflow {wait.workflow_id} not found")

                workflow_config = {
                    "id": str(workflow.id),
                    "nodes": workflow.nodes or [],
                    "edges": workflow.edges or [],
                }
                workflow_engine = WorkflowEngine(workflow_config)

                # Re-enter the engine at the wait node. The signal keys tell the
                # node it is resuming (time is over) so it restores context and
                # passes its input through instead of pausing again.
                await workflow_engine.execute_from_node(
                    start_node_id=wait.wait_node_id,
                    thread_id=wait.thread_id,
                    input_data={
                        "wait_resume_node_id": wait.wait_node_id,
                        "message": "",
                    },
                )

                await wait_repository.mark_status(
                    wait_id, WorkflowWaitStatus.COMPLETED
                )
                logger.info(f"Workflow wait {wait_id} resumed successfully")

            except Exception as e:
                logger.error(
                    f"Error resuming workflow wait {wait_id}: {str(e)}",
                    exc_info=True,
                )
                try:
                    await wait_repository.mark_status(
                        wait_id, WorkflowWaitStatus.FAILED, error_message=str(e)
                    )
                except Exception as update_error:
                    logger.error(
                        f"Error updating wait status for {wait_id}: {str(update_error)}"
                    )
        finally:
            await session.close()


async def resume_workflow_wait_async_with_scope(wait_id: UUID):
    """Run the resume across all tenants (only the owning tenant acts)."""
    from app.tasks.base import create_task_wrapper, run_task_for_all_tenants

    async def task_with_uuid_conversion(**kwargs):
        task_wait_id = kwargs.get("wait_id", wait_id)
        if isinstance(task_wait_id, str):
            task_wait_id = UUID(task_wait_id)
        return await resume_workflow_wait_async(task_wait_id)

    try:
        logger.info(f"Starting workflow wait resume for all tenants: {wait_id}")
        wrapper = create_task_wrapper(task_with_uuid_conversion)
        results = await run_task_for_all_tenants(wrapper, wait_id=str(wait_id))
        return {"status": "success", "results": results}
    except Exception as e:
        logger.error(f"Error in workflow wait resume task: {str(e)}")
        return {"status": "failed", "error": str(e)}
    finally:
        logger.debug("Workflow wait resume task completed.")


@shared_task(name="resume_workflow_wait")
def resume_workflow_wait_task(wait_id: str):
    """Celery task to resume a suspended Wait execution asynchronously."""
    logger.info(f"Starting workflow wait resume: {wait_id}")
    try:
        run_async_in_celery(
            resume_workflow_wait_async_with_scope(UUID(wait_id)),
            timeout=2 * 60 * 60,
            task_name=f"resume_workflow_wait_task[{wait_id}]",
        )
    except Exception as e:
        logger.error(
            f"Error in workflow wait resume task {wait_id}: {str(e)}", exc_info=True
        )
        raise


# ==================== Scheduler (beat) ====================

async def check_due_workflow_waits_async():
    """Claim due Wait rows for the current tenant and dispatch resume tasks."""
    tenant_id = get_tenant_context()
    session_factory = multi_tenant_manager.get_tenant_session_factory(tenant_id)

    async with session_factory() as session:
        try:
            wait_repository = WorkflowWaitStateRepository(session)
            now = datetime.now(timezone.utc)

            due_ids = await wait_repository.claim_due(now)
            for wait_id in due_ids:
                # Dispatch outside the claim transaction; the row is already
                # RESUMING so a second beat tick won't re-claim it.
                resume_workflow_wait_task.delay(str(wait_id))
                logger.info(f"Dispatched workflow wait resume: {wait_id}")

            if due_ids:
                logger.info(f"Dispatched {len(due_ids)} workflow wait resume(s)")

        except Exception as e:
            logger.exception(f"Error checking due workflow waits: {str(e)}")
        finally:
            await session.close()


async def check_due_workflow_waits_async_with_scope():
    """Run the due-wait check for all tenants."""
    from app.tasks.base import run_task_with_tenant_support

    return await run_task_with_tenant_support(
        check_due_workflow_waits_async,
        "due workflow waits check",
    )


@shared_task
def check_due_workflow_waits():
    """Celery beat task to resume Wait executions whose time is up (every minute)."""
    try:
        run_async_in_celery(
            check_due_workflow_waits_async_with_scope(),
            timeout=50,
            task_name="check_due_workflow_waits",
        )
    except Exception as e:
        logger.error(f"Error in due workflow waits check task: {str(e)}", exc_info=True)
        raise


# ==================== Reconciliation (crash recovery) ====================

_STUCK_WAIT_ERROR = (
    "Wait did not resume — the worker/pod was lost or restarted after the wait "
    "time passed. Not re-dispatched to avoid duplicating downstream side effects."
)


async def reconcile_stuck_workflow_waits_async():
    """Fail waits left un-resumed well past their resume_at for the current tenant."""
    tenant_id = get_tenant_context()
    session_factory = multi_tenant_manager.get_tenant_session_factory(tenant_id)

    async with session_factory() as session:
        try:
            wait_repository = WorkflowWaitStateRepository(session)
            stuck_before = datetime.now(timezone.utc) - timedelta(
                seconds=settings.WORKFLOW_WAIT_STUCK_MAX_AGE_SECONDS
            )
            failed = await wait_repository.mark_stuck_as_failed(
                stuck_before=stuck_before,
                error_message=_STUCK_WAIT_ERROR,
            )
            if failed:
                logger.warning(
                    f"Reconciled {failed} stuck workflow wait(s) as FAILED "
                    f"for tenant {tenant_id}"
                )
        except Exception as e:
            logger.error(
                f"Error reconciling stuck workflow waits: {str(e)}", exc_info=True
            )
        finally:
            await session.close()


async def reconcile_stuck_workflow_waits_async_with_scope():
    """Run the stuck-wait reconciliation for all tenants."""
    from app.tasks.base import run_task_with_tenant_support

    return await run_task_with_tenant_support(
        reconcile_stuck_workflow_waits_async,
        "reconcile stuck workflow waits",
    )


@shared_task
def reconcile_stuck_workflow_waits():
    """Celery beat task to fail waits orphaned by a worker/pod crash."""
    try:
        run_async_in_celery(
            reconcile_stuck_workflow_waits_async_with_scope(),
            timeout=50,
            task_name="reconcile_stuck_workflow_waits",
        )
    except Exception as e:
        logger.error(
            f"Error in stuck-wait reconciliation task: {str(e)}", exc_info=True
        )
        raise
