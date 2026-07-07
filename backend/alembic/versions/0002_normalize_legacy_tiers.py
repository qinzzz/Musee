"""Normalize legacy tier values to the current plan names.

The pre-plans tier system had free/member/power; PLANS only defines
free/unlimited, and unknown tiers fall back to free — silently
downgrading accounts that used to be unmetered. Map them to what they
meant.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-07
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE users SET tier = 'unlimited' WHERE tier IN ('power', 'member')")


def downgrade() -> None:
    # Original distinctions (power vs member) are not recoverable.
    pass
