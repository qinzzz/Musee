import os
import uuid
import logging
from datetime import datetime
from typing import Optional

from .base import StorageService
from app.config.settings import settings

logger = logging.getLogger(__name__)


class LocalStorageService(StorageService):
    """Local filesystem storage service."""

    def __init__(self, uploads_dir: str = None):
        self.uploads_dir = uploads_dir or settings.uploads_dir
        self._ensure_directory()

    def _ensure_directory(self):
        """Ensure the uploads directory exists."""
        uploads_path = os.path.join(os.getcwd(), self.uploads_dir)
        os.makedirs(uploads_path, exist_ok=True)

    async def save(self, data: bytes, filename: str, user_id: str = "anonymous") -> str:
        """Save image bytes to local filesystem."""
        # Create user directory
        user_dir = os.path.join(os.getcwd(), self.uploads_dir, user_id)
        os.makedirs(user_dir, exist_ok=True)

        # Generate unique filename
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        ext = os.path.splitext(filename)[1] or '.jpg'
        new_filename = f"{timestamp}_{unique_id}{ext}"
        filepath = os.path.join(user_dir, new_filename)

        # Write to disk
        with open(filepath, 'wb') as f:
            f.write(data)

        # Return relative path
        relative_path = f"{self.uploads_dir}/{user_id}/{new_filename}"
        logger.info(f"Saved image to local storage: {relative_path}")

        return relative_path

    async def load(self, uri: str) -> bytes:
        """Load image bytes from local filesystem."""
        if not uri:
            raise ValueError("URI is empty")

        # Construct absolute path
        filepath = os.path.join(os.getcwd(), uri)

        if not os.path.exists(filepath):
            logger.error(f"File not found: {filepath}")
            raise FileNotFoundError(f"File not found: {uri}")

        with open(filepath, 'rb') as f:
            return f.read()

    async def delete(self, uri: str) -> bool:
        """Delete file from local filesystem."""
        try:
            filepath = os.path.join(os.getcwd(), uri)
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"Deleted file: {uri}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete file {uri}: {e}")
            return False

    def get_public_url(self, uri: str, base_url: str = "") -> str:
        """Get public URL for local file."""
        if uri.startswith(('http://', 'https://')):
            return uri
        if uri.startswith(self.uploads_dir):
            return f"{base_url}/{uri}"
        return uri

    def is_managed_uri(self, uri: str) -> bool:
        """Check if URI is a local storage path."""
        return uri.startswith(self.uploads_dir)
