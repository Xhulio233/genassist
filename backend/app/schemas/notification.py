from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class NotificationItem(BaseModel):
    id: str
    title: str
    description: str
    timestamp: datetime
    type: str
    action_url: str
    group_id: str | None = None
    read: bool = False


class NotificationFeedResponse(BaseModel):
    items: list[NotificationItem]
    has_more: bool = False


class NotificationMarkReadRequest(BaseModel):
    """Mark dashboard notification feed rows as read for the current user."""

    notification_ids: list[str] = Field(
        default_factory=list,
        max_length=500,
        description="Stable notification ids from the feed (e.g. conversation_started:<uuid>).",
    )

    @field_validator("notification_ids", mode="before")
    @classmethod
    def _normalize_notification_ids(cls, v: object) -> list[str]:
        if not isinstance(v, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for raw in v:
            if not isinstance(raw, str):
                continue
            s = raw.strip()
            if not s or len(s) > 512 or s in seen:
                continue
            seen.add(s)
            out.append(s)
        return out[:500]


class NotificationUserSettingsRead(BaseModel):
    conversation_started: bool
    conversation_hostility: bool
    conversation_finalized_hostility: bool
    workflow_failed: bool
    can_manage_workflow_failed: bool


class NotificationUserSettingsUpdate(BaseModel):
    conversation_started: bool | None = None
    conversation_hostility: bool | None = None
    conversation_finalized_hostility: bool | None = None
    workflow_failed: bool | None = None


class NotificationTypeTargetingRead(BaseModel):
    """Admin view: who receives each notification type."""

    type_key: str
    allow_all_tenant_users: bool
    user_ids: list[UUID] = Field(default_factory=list)
    group_ids: list[UUID] = Field(default_factory=list)


class NotificationAdminTargetingRead(BaseModel):
    types: list[NotificationTypeTargetingRead]


class NotificationTypeTargetingUpdate(BaseModel):
    allow_all_tenant_users: bool
    user_ids: list[UUID] = Field(default_factory=list)
    group_ids: list[UUID] = Field(default_factory=list)
