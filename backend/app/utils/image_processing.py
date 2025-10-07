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


async def process_image(file: UploadFile) -> Tuple[str, bytes, Dict[str, Any]]:
    """
    Process uploaded image and return file path, bytes, and metadata
    
    Returns:
        Tuple of (file_path, image_bytes, metadata)
    """
    
    # Validate image
    await validate_image(file)
    
    # Read image bytes
    image_bytes = await file.read()
    
    # Open image with PIL for processing
    try:
        image = Image.open(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")
    
    # Generate unique filename
    file_ext = file.filename.split('.')[-1].lower()
    unique_filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(settings.upload_dir, unique_filename)
    
    # Resize image if too large (max 2048px on longest side)
    max_dimension = 2048
    if max(image.size) > max_dimension:
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        # Save resized image
        image.save(file_path, optimize=True, quality=85)
        # Re-read bytes for AI processing
        with open(file_path, 'rb') as f:
            image_bytes = f.read()
    else:
        # Save original image
        with open(file_path, 'wb') as f:
            f.write(image_bytes)
    
    # Extract metadata
    metadata = extract_image_metadata(image, file.filename, len(image_bytes))
    
    return file_path, image_bytes, metadata


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


def cleanup_old_files(days_old: int = 30) -> None:
    """Clean up old uploaded files (for maintenance)"""
    
    import time
    current_time = time.time()
    cutoff_time = current_time - (days_old * 24 * 60 * 60)
    
    for filename in os.listdir(settings.upload_dir):
        file_path = os.path.join(settings.upload_dir, filename)
        if os.path.isfile(file_path):
            file_age = os.path.getctime(file_path)
            if file_age < cutoff_time:
                try:
                    os.remove(file_path)
                except OSError:
                    pass  # File might be in use or already deleted