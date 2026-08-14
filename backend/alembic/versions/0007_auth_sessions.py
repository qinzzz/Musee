"""Add revocable rotating authentication sessions.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "auth_sessions" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_family_id", sa.String(), nullable=False),
        sa.Column("current_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("previous_token_hash", sa.String(64), nullable=True),
        sa.Column("previous_token_valid_until", sa.DateTime(), nullable=True),
        sa.Column("rotation_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("absolute_expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revocation_reason", sa.String(40), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_token_family_id", "auth_sessions", ["token_family_id"])
    op.create_index("ix_auth_sessions_absolute_expires_at", "auth_sessions", ["absolute_expires_at"])
    op.create_index("ix_auth_sessions_user_active", "auth_sessions", ["user_id", "revoked_at"])


def downgrade() -> None:
    op.drop_table("auth_sessions")
