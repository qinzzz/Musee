import uuid
import logging
from datetime import datetime

import boto3
from botocore.config import Config

from .base import StorageService
from app.config.settings import settings

logger = logging.getLogger(__name__)


class R2StorageService(StorageService):
    """Cloudflare R2 storage service (S3-compatible API)."""

    def __init__(self):
        self.bucket_name = settings.r2_bucket_name
        self.public_url = settings.r2_public_url.rstrip("/") if settings.r2_public_url else None

        self._client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

    def _make_key(self, filename: str, user_id: str) -> str:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
        return f"artworks/{user_id}/{timestamp}_{unique_id}.{ext}"

    def _content_type(self, ext: str) -> str:
        return {"png": "image/png", "webp": "image/webp"}.get(ext.lower(), "image/jpeg")

    async def save(self, data: bytes, filename: str, user_id: str = "anonymous") -> str:
        key = self._make_key(filename, user_id)
        ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"

        self._client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=data,
            ContentType=self._content_type(ext),
        )

        url = f"{self.public_url}/{key}"
        logger.info(f"Saved image to R2: {url}")
        return url

    async def load(self, uri: str) -> bytes:
        key = uri.removeprefix(self.public_url + "/")
        response = self._client.get_object(Bucket=self.bucket_name, Key=key)
        return response["Body"].read()

    async def delete(self, uri: str) -> bool:
        try:
            key = uri.removeprefix(self.public_url + "/")
            self._client.delete_object(Bucket=self.bucket_name, Key=key)
            logger.info(f"Deleted from R2: {uri}")
            return True
        except Exception as e:
            logger.error(f"Error deleting from R2: {e}")
            return False

    def get_public_url(self, uri: str, base_url: str = "") -> str:
        return uri  # R2 public URLs are already direct

    def is_managed_uri(self, uri: str) -> bool:
        return bool(self.public_url and uri.startswith(self.public_url))
