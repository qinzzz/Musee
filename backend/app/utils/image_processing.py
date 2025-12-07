from PIL import Image, ExifTags
from fastapi import HTTPException, UploadFile
from typing import Dict, Any, Tuple
import os
import uuid
from datetime import datetime
from app.config.settings import settings

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
    
    # Check file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    max_size = settings.max_file_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=400, 
            detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB"
        )


async def process_image(file: UploadFile) -> Tuple[bytes, Dict[str, Any]]:
    """
    Process uploaded image and return bytes and metadata (stateless - no file saving)

    Returns:
        Tuple of (image_bytes, metadata)
    """

    # Validate image
    await validate_image(file)

    # Read image bytes
    image_bytes = await file.read()

    # Open image with PIL for processing
    try:
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # Resize image if too large (max 2048px on longest side)
    max_dimension = 2048
    if max(image.size) > max_dimension:
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        # Convert resized image back to bytes
        output = BytesIO()
        image.save(output, format=image.format or 'JPEG', optimize=True, quality=85)
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


