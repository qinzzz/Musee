import time
import uuid
import logging
from datetime import datetime
from functools import partial

import anyio
import boto3
from botocore.config import Config

from .base import StorageService
from app.config.settings import settings
from app.observability.telemetry import record_storage_operation_duration

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
            config=Config(
                signature_version="s3v4",
                # Fail fast instead of botocore's 60s defaults: one bad
                # handshake was costing a full minute per upload.
                connect_timeout=5,
                read_timeout=30,
                retries={"max_attempts": 3, "mode": "standard"},
            ),
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

        logger.info("Uploading image to R2: key=%s size=%d bytes", key, len(data))
        started = time.perf_counter()
        success = False
        try:
            # boto3 is synchronous; run it in a worker thread so slow R2
            # transfers don't block the event loop for every other request.
            await anyio.to_thread.run_sync(
                partial(
                    self._client.put_object,
                    Bucket=self.bucket_name,
                    Key=key,
                    Body=data,
                    ContentType=self._content_type(ext),
                )
            )
            success = True
        finally:
            elapsed = time.perf_counter() - started
            record_storage_operation_duration(elapsed, "save", success)

        url = f"{self.public_url}/{key}"
        logger.info("Saved image to R2 in %.0fms: %s", elapsed * 1000, url)
        return url

    async def load(self, uri: str) -> bytes:
        key = uri.removeprefix(self.public_url + "/")
        started = time.perf_counter()
        success = False
        try:
            response = await anyio.to_thread.run_sync(
                partial(self._client.get_object, Bucket=self.bucket_name, Key=key)
            )
            body = await anyio.to_thread.run_sync(response["Body"].read)
            success = True
            return body
        finally:
            record_storage_operation_duration(
                time.perf_counter() - started, "load", success
            )

    async def delete(self, uri: str) -> bool:
        started = time.perf_counter()
        try:
            key = uri.removeprefix(self.public_url + "/")
            await anyio.to_thread.run_sync(
                partial(self._client.delete_object, Bucket=self.bucket_name, Key=key)
            )
            record_storage_operation_duration(time.perf_counter() - started, "delete", True)
            logger.info(f"Deleted from R2: {uri}")
            return True
        except Exception as e:
            record_storage_operation_duration(time.perf_counter() - started, "delete", False)
            logger.error(f"Error deleting from R2: {e}")
            return False

    def get_public_url(self, uri: str, base_url: str = "") -> str:
        return uri  # R2 public URLs are already direct

    def is_managed_uri(self, uri: str) -> bool:
        return bool(self.public_url and uri.startswith(self.public_url))
