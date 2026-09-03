from __future__ import annotations

from io import BytesIO
import logging

import anyio
from PIL import Image, ImageOps

from app.services.storage.base import StorageService
from app.services.storage.factory import get_storage_service

logger = logging.getLogger(__name__)

THUMBNAIL_MAX_DIMENSION = 512
THUMBNAIL_JPEG_QUALITY = 75


def create_artwork_thumbnail_bytes(image_bytes: bytes) -> bytes:
    """Create an orientation-corrected JPEG derivative for image-dense UI."""
    with Image.open(BytesIO(image_bytes)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail(
            (THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION),
            Image.Resampling.LANCZOS,
        )
        output = BytesIO()
        image.save(
            output,
            format="JPEG",
            optimize=True,
            quality=THUMBNAIL_JPEG_QUALITY,
        )
        return output.getvalue()


async def save_artwork_thumbnail(
    image_bytes: bytes,
    user_id: str,
    *,
    storage: StorageService | None = None,
) -> str | None:
    """Save a best-effort thumbnail, returning None without failing the upload."""
    resolved_storage = storage or get_storage_service()
    try:
        thumbnail_bytes = await anyio.to_thread.run_sync(
            create_artwork_thumbnail_bytes,
            image_bytes,
        )
        return await resolved_storage.save(
            thumbnail_bytes,
            "artwork_thumbnail.jpg",
            user_id,
        )
    except Exception:
        logger.warning("Artwork thumbnail generation failed", exc_info=True)
        return None


async def save_artwork_image_variants(
    image_bytes: bytes,
    user_id: str,
    *,
    storage: StorageService | None = None,
) -> tuple[str, str | None]:
    """Persist the authoritative image, followed by its optional thumbnail."""
    resolved_storage = storage or get_storage_service()
    photo_uri = await resolved_storage.save(image_bytes, "artwork.jpg", user_id)
    thumbnail_uri = await save_artwork_thumbnail(
        image_bytes,
        user_id,
        storage=resolved_storage,
    )
    return photo_uri, thumbnail_uri


async def delete_artwork_image_variants(
    photo_uri: str | None,
    thumbnail_uri: str | None,
    *,
    storage: StorageService | None = None,
) -> None:
    """Best-effort cleanup for a failed persistence operation."""
    resolved_storage = storage or get_storage_service()
    for uri in (thumbnail_uri, photo_uri):
        if not uri:
            continue
        try:
            await resolved_storage.delete(uri)
        except Exception:
            logger.warning("Artwork image cleanup failed for %s", uri, exc_info=True)
