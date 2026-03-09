import logging
from typing import Optional
from enum import Enum

from .base import StorageService
from .local_storage import LocalStorageService
from .vercel_blob_storage import VercelBlobStorageService
from .r2_storage import R2StorageService
from app.config.settings import settings

logger = logging.getLogger(__name__)


class StorageType(str, Enum):
    LOCAL = "local"
    VERCEL_BLOB = "vercel_blob"
    R2 = "r2"


class StorageFactory:
    """Factory for creating storage service instances."""

    _instances: dict[StorageType, StorageService] = {}

    @classmethod
    def get_service(cls, storage_type: StorageType = None) -> StorageService:
        """
        Get a storage service instance.

        Args:
            storage_type: Type of storage to use. If None, uses settings.storage_type

        Returns:
            StorageService instance
        """
        if storage_type is None:
            storage_type = StorageType(settings.storage_type)

        if storage_type not in cls._instances:
            if storage_type == StorageType.LOCAL:
                cls._instances[storage_type] = LocalStorageService()
            elif storage_type == StorageType.VERCEL_BLOB:
                cls._instances[storage_type] = VercelBlobStorageService()
            elif storage_type == StorageType.R2:
                cls._instances[storage_type] = R2StorageService()
            else:
                raise ValueError(f"Unknown storage type: {storage_type}")

            logger.info(f"Created storage service: {storage_type.value}")

        return cls._instances[storage_type]

    @classmethod
    def get_service_for_uri(cls, uri: str) -> Optional[StorageService]:
        """
        Get the appropriate storage service for a given URI.

        Args:
            uri: The storage URI

        Returns:
            StorageService that manages this URI, or None
        """
        # Check R2 first (most specific pattern — public URL prefix)
        r2_service = R2StorageService()
        if r2_service.is_managed_uri(uri):
            return cls.get_service(StorageType.R2)

        # Check Vercel Blob
        blob_service = VercelBlobStorageService()
        if blob_service.is_managed_uri(uri):
            return cls.get_service(StorageType.VERCEL_BLOB)

        # Check local storage
        local_service = LocalStorageService()
        if local_service.is_managed_uri(uri):
            return cls.get_service(StorageType.LOCAL)

        return None


def get_storage_service() -> StorageService:
    """Convenience function to get the configured storage service."""
    return StorageFactory.get_service()
