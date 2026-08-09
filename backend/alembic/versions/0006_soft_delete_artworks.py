"""Add soft-delete lifecycle state to saved artworks.

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("saved_artworks")}
    if "deleted_at" not in columns:
        op.add_column("saved_artworks", sa.Column("deleted_at", sa.DateTime(), nullable=True))

    indexes = {index["name"] for index in inspector.get_indexes("saved_artworks")}
    if "idx_saved_artworks_active_user_created" not in indexes:
        op.create_index(
            "idx_saved_artworks_active_user_created",
            "saved_artworks",
            ["user_id", "created_at"],
            unique=False,
            postgresql_where=sa.text("deleted_at IS NULL"),
            sqlite_where=sa.text("deleted_at IS NULL"),
        )


def downgrade() -> None:
    op.drop_index("idx_saved_artworks_active_user_created", table_name="saved_artworks")
    op.drop_column("saved_artworks", "deleted_at")
