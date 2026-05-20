"""add is_read to notification_type_recipient_users

Revision ID: 8bfe88a0f6c0
Revises: k1l2m3n4o5p6
Create Date: 2026-05-20 11:41:44.004345

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8bfe88a0f6c0"
down_revision: Union[str, None] = "k1l2m3n4o5p6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_type_recipient_users",
        sa.Column(
            "is_read",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_column(
        "notification_type_recipient_users",
        "is_read",
        if_exists=True,
    )
