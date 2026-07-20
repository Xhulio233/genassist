"""add_workflow_wait_states

Revision ID: a1c4e7f9b2d6
Revises: 21f612ab93ba
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f9b2d6'
down_revision: Union[str, None] = '21f612ab93ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    wait_status_enum = postgresql.ENUM(
        'WAITING', 'RESUMING', 'COMPLETED', 'FAILED', 'CANCELLED',
        name='workflow_wait_status_enum',
        create_type=False,
    )
    wait_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'workflow_wait_states',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('workflow_id', sa.UUID(), nullable=False),
        sa.Column('thread_id', sa.String(length=255), nullable=False),
        sa.Column('wait_node_id', sa.String(length=255), nullable=False),
        sa.Column('resume_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', wait_status_enum, nullable=False, server_default='WAITING'),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('resumed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('is_deleted', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'idx_workflow_wait_states_status_resume_at',
        'workflow_wait_states',
        ['status', 'resume_at'],
    )
    op.create_index(
        'idx_workflow_wait_states_thread_id',
        'workflow_wait_states',
        ['thread_id'],
    )


def downgrade() -> None:
    op.drop_index('idx_workflow_wait_states_thread_id', table_name='workflow_wait_states')
    op.drop_index('idx_workflow_wait_states_status_resume_at', table_name='workflow_wait_states')
    op.drop_table('workflow_wait_states')

    postgresql.ENUM(name='workflow_wait_status_enum').drop(op.get_bind(), checkfirst=True)
