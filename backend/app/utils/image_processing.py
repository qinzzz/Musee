from PIL import Image, ExifTags, ImageOps
from fastapi import HTTPException, UploadFile
from typing import Dict, Any, Tuple
import os
import uuid
import logging
from datetime import datetime
from app.config.settings import settings

logger = logging.getLogger(__name__)

allowed_extensions = ["jpg","jpeg","png","webp"]

async def validate_image(file: UploadFile) -> None:
    """Validate uploaded image file"""

    # Check file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    file_ext = file.filename.split('.')[-1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
        )

    # Check file size using async methods
    # Read all content to check size, then reset
    content = await file.read()
    file_size = len(content)
    await file.seek(0)  # Reset to beginning for subsequent reads

    max_size = settings.max_file_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB"
        )

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")


async def process_image(file: UploadFile) -> Tuple[bytes, Dict[str, Any]]:
    """
    Process uploaded image and return bytes and metadata (stateless - no file saving)

    Returns:
        Tuple of (image_bytes, metadata)
    """

    # Validate image
    await validate_image(file)

    # Ensure file position is at start before reading
    await file.seek(0)

    # Read image bytes
    image_bytes = await file.read()

    logger.info(f"Processing image: filename={file.filename}, content_type={file.content_type}, size={len(image_bytes)} bytes")

    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty")

    # Log first few bytes for debugging (image magic numbers)
    if len(image_bytes) >= 4:
        logger.info(f"Image header bytes: {image_bytes[:4].hex()}")

    # Open image with PIL for processing
    try:
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes))
        
        # Correct orientation based on EXIF before further processing
        # This ensures images from mobile devices are correctly oriented
        image = ImageOps.exif_transpose(image)
        
        logger.info(f"PIL opened image: format={image.format}, mode={image.mode}, size={image.size}")
    except Exception as e:
        logger.error(f"Failed to open image with PIL: {e}, first 100 bytes: {image_bytes[:100]}")
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # Resize image if too large (max 1024px on longest side for AI service limits)
    max_dimension = 1024
    output = BytesIO()

    # Convert to RGB if necessary (for PNG with transparency, etc.)
    if image.mode in ('RGBA', 'P'):
        image = image.convert('RGB')

    if max(image.size) > max_dimension:
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

    # Always re-encode to ensure proper compression
    image.save(output, format='JPEG', optimize=True, quality=80)
    image_bytes = output.getvalue()

    # If still too large (>900KB), reduce quality further
    if len(image_bytes) > 900 * 1024:
        output = BytesIO()
        image.save(output, format='JPEG', optimize=True, quality=60)
        image_bytes = output.getvalue()

    return image_bytes


def extract_image_metadata(image: Image.Image, filename: str, file_size: int) -> Dict[str, Any]:
    """Extract metadata from PIL Image"""
    
    metadata = {
        "filename": filename,
        "size": file_size,
        "dimensions": image.size,
        "format": image.format or "Unknown",
        "upload_timestamp": datetime.utcnow().isoformat()
    }
    
    # Extract EXIF data if available
    exif_data = {}
    if hasattr(image, '_getexif') and image._getexif() is not None:
        exif = image._getexif()
        for tag_id, value in exif.items():
            tag = ExifTags.TAGS.get(tag_id, tag_id)
            # Only include basic, non-sensitive EXIF data
            if tag in ['DateTime', 'Software', 'ColorSpace', 'Orientation']:
                exif_data[tag] = str(value)
    
    metadata["exif"] = exif_data
    return metadata


async def save_image_to_disk(image_bytes: bytes, user_id: str = "anonymous") -> str:
    """
    Save processed image bytes to the uploads directory.

    Args:
        image_bytes: Processed image data (already resized/compressed)
        user_id: User ID for organizing uploads

    Returns:
        str: Relative path to the saved image (to be stored as photo_uri)
    """
    # Create uploads directory structure
    uploads_base = os.path.join(os.getcwd(), settings.uploads_dir)
    user_dir = os.path.join(uploads_base, user_id)
    os.makedirs(user_dir, exist_ok=True)

    # Generate unique filename
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    filename = f"{timestamp}_{unique_id}.jpg"
    filepath = os.path.join(user_dir, filename)

    # Write image to disk
    with open(filepath, 'wb') as f:
        f.write(image_bytes)

    # Return relative path for storage in DB
    relative_path = f"{settings.uploads_dir}/{user_id}/{filename}"
    logger.info(f"Saved image to: {relative_path}")

    return relative_path


def get_image_url(photo_uri: str, base_url: str = "") -> str:
    """
    Convert a photo_uri to a full URL for web clients.

    Args:
        photo_uri: The stored photo URI (could be local path or already a URL)
        base_url: Base URL of the server (e.g., "http://localhost:8000")

    Returns:
        str: Full URL to access the image
    """
    # If already a full URL, return as-is
    if photo_uri.startswith(('http://', 'https://')):
        return photo_uri

    # If it's an uploads path, construct URL
    if photo_uri.startswith(settings.uploads_dir):
        return f"{base_url}/{photo_uri}"

    # For iOS local paths, return as-is (client handles it)
    return photo_uri


async def load_image_from_disk(photo_uri: str) -> bytes:
    """
    Load image bytes from disk using a photo_uri.

    Args:
        photo_uri: Relative path to the image in the uploads directory

    Returns:
        bytes: Raw image data
    """
    if not photo_uri:
        raise ValueError("photo_uri is empty")

    # Construct absolute path
    # photo_uri is expected to be like "uploads/user_id/filename.jpg"
    # or start with settings.uploads_dir
    filepath = os.path.join(os.getcwd(), photo_uri)

    if not os.path.exists(filepath):
        logger.error(f"Image file not found: {filepath}")
        raise FileNotFoundError(f"Image file not found: {photo_uri}")

    with open(filepath, 'rb') as f:
        return f.read()


