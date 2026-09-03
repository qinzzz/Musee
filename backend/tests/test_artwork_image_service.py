from io import BytesIO

import pytest
from PIL import Image

from app.services.artwork_image_service import (
    THUMBNAIL_MAX_DIMENSION,
    create_artwork_thumbnail_bytes,
    delete_artwork_image_variants,
    save_artwork_image_variants,
)


def _jpeg_bytes(size: tuple[int, int] = (1200, 800)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, color=(120, 40, 20)).save(output, format="JPEG", quality=95)
    return output.getvalue()


class _Storage:
    def __init__(self, *, fail_thumbnail: bool = False):
        self.calls: list[tuple[bytes, str, str]] = []
        self.deleted: list[str] = []
        self.fail_thumbnail = fail_thumbnail

    async def save(self, data: bytes, filename: str, user_id: str) -> str:
        self.calls.append((data, filename, user_id))
        if self.fail_thumbnail and filename == "artwork_thumbnail.jpg":
            raise RuntimeError("thumbnail unavailable")
        return f"r2://{filename}"

    async def delete(self, uri: str) -> bool:
        self.deleted.append(uri)
        return True


def test_create_artwork_thumbnail_bounds_dimensions_and_outputs_jpeg():
    thumbnail = create_artwork_thumbnail_bytes(_jpeg_bytes())

    with Image.open(BytesIO(thumbnail)) as image:
        assert image.format == "JPEG"
        assert image.size == (THUMBNAIL_MAX_DIMENSION, 341)


@pytest.mark.asyncio
async def test_save_artwork_image_variants_persists_original_then_thumbnail():
    storage = _Storage()

    photo_uri, thumbnail_uri = await save_artwork_image_variants(
        _jpeg_bytes(),
        "user-1",
        storage=storage,
    )

    assert photo_uri == "r2://artwork.jpg"
    assert thumbnail_uri == "r2://artwork_thumbnail.jpg"
    assert [call[1] for call in storage.calls] == ["artwork.jpg", "artwork_thumbnail.jpg"]


@pytest.mark.asyncio
async def test_save_artwork_image_variants_keeps_original_when_thumbnail_fails():
    storage = _Storage(fail_thumbnail=True)

    photo_uri, thumbnail_uri = await save_artwork_image_variants(
        _jpeg_bytes(),
        "user-1",
        storage=storage,
    )

    assert photo_uri == "r2://artwork.jpg"
    assert thumbnail_uri is None


@pytest.mark.asyncio
async def test_delete_artwork_image_variants_removes_thumbnail_and_original():
    storage = _Storage()

    await delete_artwork_image_variants(
        "r2://artwork.jpg",
        "r2://artwork_thumbnail.jpg",
        storage=storage,
    )

    assert storage.deleted == ["r2://artwork_thumbnail.jpg", "r2://artwork.jpg"]
