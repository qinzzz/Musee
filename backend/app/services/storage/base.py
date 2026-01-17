from abc import ABC, abstractmethod
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class StorageService(ABC):
    """Abstract base class for storage services."""

    @abstractmethod
    async def save(self, data: bytes, filename: str, user_id: str = "anonymous") -> str:
        """
        Save data to storage.

        Args:
            data: Raw bytes to store
            filename: Suggested filename (may be modified for uniqueness)
            user_id: User ID for organizing uploads

        Returns:
            str: URI/URL to access the stored file
        """
        pass

    @abstractmethod
    async def load(self, uri: str) -> bytes:
        """
        Load data from storage.

        Args:
            uri: The URI/URL returned from save()

        Returns:
            bytes: The stored data
        """
        pass

    @abstractmethod
    async def delete(self, uri: str) -> bool:
        """
        Delete data from storage.

        Args:
            uri: The URI/URL to delete

        Returns:
            bool: True if deleted successfully
        """
        pass

    @abstractmethod
    def get_public_url(self, uri: str, base_url: str = "") -> str:
        """
        Get a public URL for the stored file.

        Args:
            uri: The storage URI
            base_url: Base URL of the server (for local storage)

        Returns:
            str: Public URL to access the file
        """
        pass

    @abstractmethod
    def is_managed_uri(self, uri: str) -> bool:
        """
        Check if this storage service manages the given URI.

        Args:
            uri: The URI to check

        Returns:
            bool: True if this service can handle this URI
        """
        pass
