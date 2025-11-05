"""
PhotoRoom API service for background removal.
"""
import aiohttp
from app.config.settings import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class PhotoRoomService:
    """Service for removing backgrounds from images using PhotoRoom API."""

    BASE_URL = "https://sdk.photoroom.com/v1/segment"

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize PhotoRoom service.

        Args:
            api_key: PhotoRoom API key. If not provided, uses settings.
        """
        self.api_key = api_key or settings.photoroom_api_key
        if not self.api_key:
            logger.warning("PhotoRoom API key not configured")

    async def remove_background(self, image_data: bytes) -> Optional[bytes]:
        """
        Remove background from an image.

        Args:
            image_data: Image file as bytes

        Returns:
            Image with transparent background as bytes, or None on error
        """
        if not self.api_key:
            logger.error("PhotoRoom API key not configured")
            return None

        try:
            headers = {
                "x-api-key": self.api_key,
            }

            # Create form data with the image
            form = aiohttp.FormData()
            form.add_field(
                'image_file',
                image_data,
                filename='image.jpg',
                content_type='image/jpeg'
            )

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.BASE_URL,
                    headers=headers,
                    data=form
                ) as response:
                    if response.status == 200:
                        result = await response.read()
                        logger.info("Successfully removed background")
                        return result
                    else:
                        error_text = await response.text()
                        logger.error(f"PhotoRoom API error: {response.status} - {error_text}")
                        return None

        except Exception as e:
            logger.error(f"Error removing background: {str(e)}")
            return None


# Global instance
photoroom_service = PhotoRoomService()
