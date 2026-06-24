from __future__ import annotations

from fastapi import APIRouter

from app.services.admin_maintenance_service import run_legacy_migrations

router = APIRouter()


@router.post("/admin/run-migrations")
async def run_migrations():
    return run_legacy_migrations()
