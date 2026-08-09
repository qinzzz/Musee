"""Add idempotency keys for raw artwork uploads.

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("saved_artworks")}
    if "upload_operation_id" not in columns:
        op.add_column(
            "saved_artworks",
            sa.Column("upload_operation_id", sa.String(length=128), nullable=True),
        )

    indexes = {index["name"] for index in inspector.get_indexes("saved_artworks")}
    if "uq_saved_artworks_upload_operation_id" not in indexes:
        op.create_index(
            "uq_saved_artworks_upload_operation_id",
            "saved_artworks",
            ["upload_operation_id"],
            unique=True,
            postgresql_where=sa.text("upload_operation_id IS NOT NULL"),
            sqlite_where=sa.text("upload_operation_id IS NOT NULL"),
        )


def downgrade() -> None:
    op.drop_index("uq_saved_artworks_upload_operation_id", table_name="saved_artworks")
    op.drop_column("saved_artworks", "upload_operation_id")
