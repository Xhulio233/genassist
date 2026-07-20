"""add_telegram_app_setting_type

Adds 'Telegram' to the allowed values of the app_settings.type check constraint
so tenants can store per-tenant Telegram bot credentials via App Settings.

Revision ID: c4d5e6f7a8b9
Revises: 21f612ab93ba
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = '21f612ab93ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT = "app_settings_type_check"
_TABLE = "app_settings"

_OLD_TYPES = (
    "'Zendesk', 'WhatsApp', 'Gmail', 'Microsoft', 'Slack', 'Jira', 'SMTP', "
    "'Salesforce', 'FileManagerSettings', 'Other', 'Security'"
)
_NEW_TYPES = (
    "'Zendesk', 'WhatsApp', 'Gmail', 'Microsoft', 'Slack', 'Telegram', 'Jira', 'SMTP', "
    "'Salesforce', 'FileManagerSettings', 'Other', 'Security'"
)


def upgrade() -> None:
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT, _TABLE, f"type IN ({_NEW_TYPES})"
    )


def downgrade() -> None:
    # Drop any Telegram rows first so the narrower constraint can be re-applied.
    op.execute(f"DELETE FROM {_TABLE} WHERE type = 'Telegram'")
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(
        _CONSTRAINT, _TABLE, f"type IN ({_OLD_TYPES})"
    )
