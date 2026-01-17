import uuid
import logging
from datetime import datetime
from typing import Optional
import httpx

from .base import StorageService
from app.config.settings import settings

logger = logging.getLogger(__name__)


class VercelBlobStorageService(StorageService):
    """Vercel Blob storage service."""

    # Vercel Blob URL patterns
    BLOB_URL_PATTERNS = [
        '.public.blob.vercel-storage.com',
        '.blob.vercel-storage.com'
    ]

    def __init__(self, token: str = None):
        self.token = token or settings.blob_read_write_token
        if not self.token:
            logger.warning("Vercel Blob token not configured (BLOB_READ_WRITE_TOKEN)")

    async def save(self, data: bytes, filename: str, user_id: str = "anonymous") -> str:
        """
        Save image bytes to Vercel Blob storage.

        Uses the Vercel Blob API directly via HTTP.
        """
        if not self.token:
            raise ValueError("Vercel Blob token not configured")

        # Generate unique path
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        ext = filename.split('.')[-1] if '.' in filename else 'jpg'
        blob_path = f"artworks/{user_id}/{timestamp}_{unique_id}.{ext}"

        # Determine content type
        content_type = 'image/jpeg'
        if ext.lower() == 'png':
            content_type = 'image/png'
        elif ext.lower() == 'webp':
            content_type = 'image/webp'

        # Upload to Vercel Blob using their API
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"https://blob.vercel-storage.com/{blob_path}",
                content=data,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": content_type,
                    "x-api-version": "7",
                    "x-content-type": content_type,
                },
            )

            if response.status_code not in (200, 201):
                logger.error(f"Vercel Blob upload failed: {response.status_code} - {response.text}")
                raise Exception(f"Vercel Blob upload failed: {response.status_code}")

            result = response.json()
            blob_url = result.get('url')
            logger.info(f"Saved image to Vercel Blob: {blob_url}")

            return blob_url

    async def load(self, uri: str) -> bytes:
        """Load image bytes from Vercel Blob storage."""
        if not uri:
            raise ValueError("URI is empty")

        # Vercel Blob URLs are publicly accessible
        async with httpx.AsyncClient() as client:
            response = await client.get(uri)

            if response.status_code != 200:
                logger.error(f"Failed to load from Vercel Blob: {response.status_code}")
                raise FileNotFoundError(f"File not found: {uri}")

            return response.content

    async def delete(self, uri: str) -> bool:
        """Delete file from Vercel Blob storage."""
        if not self.token:
            raise ValueError("Vercel Blob token not configured")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://blob.vercel-storage.com/delete",
                    json={"urls": [uri]},
                    headers={
                        "Authorization": f"Bearer {self.token}",
                        "x-api-version": "7",
                    },
                )

                if response.status_code == 200:
                    logger.info(f"Deleted from Vercel Blob: {uri}")
                    return True
                else:
                    logger.error(f"Failed to delete from Vercel Blob: {response.status_code}")
                    return False
        except Exception as e:
            logger.error(f"Error deleting from Vercel Blob: {e}")
            return False

    def get_public_url(self, uri: str, base_url: str = "") -> str:
        """Vercel Blob URLs are already public."""
        return uri

    def is_managed_uri(self, uri: str) -> bool:
        """Check if URI is a Vercel Blob URL."""
        return any(pattern in uri for pattern in self.BLOB_URL_PATTERNS)
