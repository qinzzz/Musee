"""Add daily_usage rollup table for quota checks.

Revision ID: 0001
Revises:
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guarded: startup create_all may already have created it from the model.
    inspector = sa.inspect(op.get_bind())
    if "daily_usage" in inspector.get_table_names():
        return
    op.create_table(
        "daily_usage",
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("tokens_in", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tokens_out", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("artworks_uploaded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("daily_usage")
