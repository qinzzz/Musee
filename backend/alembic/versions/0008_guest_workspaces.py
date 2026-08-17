"""Add credential-bound guest workspaces and quota reservations.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "guest_workspaces" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "guest_workspaces",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, unique=True),
            sa.Column("credential_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("absolute_expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_guest_workspaces_user_id", "guest_workspaces", ["user_id"])
        op.create_index("ix_guest_workspaces_absolute_expires_at", "guest_workspaces", ["absolute_expires_at"])

    if "guest_quota_reservations" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "guest_quota_reservations",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("workspace_id", sa.String(), sa.ForeignKey("guest_workspaces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("quota_key", sa.String(40), nullable=False),
            sa.Column("idempotency_key", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("workspace_id", "quota_key", "idempotency_key", name="uq_guest_quota_reservation"),
        )
        op.create_index("ix_guest_quota_workspace_key", "guest_quota_reservations", ["workspace_id", "quota_key"])


def downgrade() -> None:
    op.drop_table("guest_quota_reservations")
    op.drop_table("guest_workspaces")
