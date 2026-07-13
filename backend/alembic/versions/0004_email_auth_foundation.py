"""Email/password auth foundation: credentials, email tokens, verified flag.

- user_credentials: password hashes, isolated from the serialized users row.
- email_tokens: single-use hashed tokens proving inbox ownership (email
  verification, password reset, set-password-on-Google-account).
- users.email_verified: whether inbox ownership was ever proven; backfilled
  true for Google accounts (Google verified them).

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "user_credentials" not in tables:
        op.create_table(
            "user_credentials",
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )

    if "email_tokens" not in tables:
        op.create_table(
            "email_tokens",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
            sa.Column("purpose", sa.String(30), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("anonymous_user_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_email_tokens_user_id", "email_tokens", ["user_id"])

    user_columns = {c["name"] for c in inspector.get_columns("users")}
    if "email_verified" not in user_columns:
        op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        # Google accounts arrived with Google-verified emails.
        op.execute("UPDATE users SET email_verified = true WHERE google_id IS NOT NULL")


def downgrade() -> None:
    op.drop_table("email_tokens")
    op.drop_table("user_credentials")
    op.drop_column("users", "email_verified")
