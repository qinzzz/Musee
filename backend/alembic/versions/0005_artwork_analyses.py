"""Artwork-analysis results table.

- artwork_analyses: versioned, append-only per-artwork analysis history
  (dimensions, tags, visual description) produced by the image-based
  artwork-analysis pipeline. Exactly one current row per artwork, enforced by
  a partial unique index on (artwork_id) WHERE is_current.

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-18
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "artwork_analyses" not in tables:
        op.create_table(
            "artwork_analyses",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "artwork_id",
                sa.String(),
                sa.ForeignKey("saved_artworks.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("analysis_version", sa.String(20), nullable=False),
            sa.Column("model", sa.String(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="processing"),
            sa.Column("analyzability_note", sa.Text(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("metadata_snapshot", sa.JSON(), nullable=True),
            sa.Column("visual_description", sa.Text(), nullable=True),
            sa.Column("dimensions", sa.JSON(), nullable=True),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("proposed_categories", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_artwork_analyses_artwork_id", "artwork_analyses", ["artwork_id"])
        op.create_index(
            "idx_artwork_analyses_artwork_created",
            "artwork_analyses",
            ["artwork_id", "created_at"],
        )
        op.create_index(
            "uq_artwork_analyses_current",
            "artwork_analyses",
            ["artwork_id"],
            unique=True,
            postgresql_where=sa.text("is_current"),
            sqlite_where=sa.text("is_current"),
        )


def downgrade() -> None:
    op.drop_table("artwork_analyses")
