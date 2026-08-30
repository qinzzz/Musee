from PIL import Image, ExifTags, ImageOps
from fastapi import HTTPException, UploadFile
from typing import Dict, Any, Tuple
from io import BytesIO
import os
import uuid
import logging
import anyio
import json
import httpx
from datetime import datetime
from app.config.settings import settings

logger = logging.getLogger(__name__)


def compress_for_ai(image_bytes: bytes, max_dimension: int = 1024, max_kb: int = 900) -> bytes:
    """Resize and compress raw image bytes to fit AI provider limits."""
    img = Image.open(BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
    if max(img.size) > max_dimension:
        img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    limit = max_kb * 1024
    for quality in [80, 60, 40, 25]:
        output = BytesIO()
        img.save(output, format='JPEG', optimize=True, quality=quality)
        result = output.getvalue()
        if len(result) <= limit:
            return result
    # Last resort: halve dimensions
    img = img.resize((img.width // 2, img.height // 2), Image.Resampling.LANCZOS)
    output = BytesIO()
    img.save(output, format='JPEG', optimize=True, quality=60)
    return output.getvalue()

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

    try:
        # Open image for metadata extraction
        image = Image.open(BytesIO(image_bytes))
        
        # Extract metadata (includes async reverse geocoding if GPS present)
        metadata = await extract_image_metadata(image, file.filename, len(image_bytes))
        
        # Define the CPU-bound PIL processing to run in a thread
        def _do_pil_processing(img: Image.Image) -> bytes:
            try:
                # Correct orientation based on EXIF before further processing
                img = ImageOps.exif_transpose(img)
                
                # Resize image if too large (max 1024px on longest side for AI service limits)
                max_dimension = 1024
                
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                if max(img.size) > max_dimension:
                    img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

                # Save to JPEG
                output = BytesIO()
                img.save(output, format='JPEG', optimize=True, quality=80)
                processed_bytes = output.getvalue()

                # If still too large (>900KB), reduce quality further
                if len(processed_bytes) > 900 * 1024:
                    output = BytesIO()
                    img.save(output, format='JPEG', optimize=True, quality=60)
                    processed_bytes = output.getvalue()
                    
                return processed_bytes
            except Exception as e:
                logger.error(f"PIL processing error: {e}")
                raise e

        # Run sync PIL code in a thread pool to avoid blocking the event loop
        processed_image_bytes = await anyio.to_thread.run_sync(_do_pil_processing, image)
        return processed_image_bytes, metadata
    except Exception as e:
        logger.error(f"Failed to process image: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")


def _convert_to_degrees(value):
    """Helper function to convert the GPS coordinates stored in the EXIF to decimal degrees"""
    d = float(value[0])
    m = float(value[1])
    s = float(value[2])
    return d + (m / 60.0) + (s / 3600.0)


def _gps_accuracy_meters(gps_data):
    """EXIF GPSHPositioningError = horizontal accuracy in metres, when present.

    Only some cameras write it (iPhone does; many don't). Returned so the venue
    resolver can trust a tight-accuracy capture and stay conservative on a loose
    or missing one, instead of throwing the signal away.
    """
    raw = gps_data.get("GPSHPositioningError")
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None

def _format_exif_date(date_str):
    """Convert EXIF date string (YYYY:MM:DD HH:MM:SS) to (Month Day, Year)"""
    try:
        # EXIF dates are typically YYYY:MM:DD HH:MM:SS, but some sources use dashes
        clean_date = date_str[:19].replace('-', ':')
        dt = datetime.strptime(clean_date, '%Y:%m:%d %H:%M:%S')
        return dt.strftime('%b %d, %Y')
    except Exception:
        return date_str

_MUSEUM_OSM_VALUES = {"museum", "gallery", "arts_centre", "art_gallery", "exhibition_centre"}

async def _find_museum_nearby(lat: float, lon: float, radius: int = 400) -> str:
    """
    Overpass API fallback: search for a museum/gallery within `radius` metres.
    Returns the name of the NEAREST result by distance to (lat, lon).
    Overpass returns results in internal OSM-ID order (not by proximity), so we
    fetch all candidates and sort ourselves.
    """
    query = (
        f"[out:json][timeout:6];"
        f"("
        f'node["tourism"~"^(museum|gallery|arts_centre)$"](around:{radius},{lat},{lon});'
        f'way["tourism"~"^(museum|gallery|arts_centre)$"](around:{radius},{lat},{lon});'
        f'relation["tourism"~"^(museum|gallery|arts_centre)$"](around:{radius},{lat},{lon});'
        f");"
        f"out center;"  # no limit — we pick the closest ourselves
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "MuseeApp/1.0"},
            )
            if response.status_code == 200:
                elements = response.json().get("elements", [])
                if not elements:
                    return ""
                # nodes carry lat/lon at top level; ways/relations get a synthetic
                # "center" object from `out center`.  Fall back to query point if absent.
                def dist_sq(el: dict) -> float:
                    c = el.get("center") or el
                    dlat = c.get("lat", lat) - lat
                    dlon = c.get("lon", lon) - lon
                    return dlat * dlat + dlon * dlon

                nearest = min(elements, key=dist_sq)
                return nearest.get("tags", {}).get("name", "")
    except Exception as e:
        logger.debug(f"Overpass nearby search failed: {e}")
    return ""


async def reverse_geocode(lat: float, lon: float) -> Dict[str, Any]:
    """
    Reverse geocode coordinates.
    Step 1 — Nominatim point lookup (fast).
    Step 2 — Overpass radius search (fallback when GPS lands on a road/park path
              instead of the museum building, e.g. campus-style museums).
    Returns: {city, country, museum, latitude, longitude, raw}
    """
    url = f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={lat}&lon={lon}"

    city = country = museum = raw = ""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers={"User-Agent": "MuseeApp/1.0"})
            if response.status_code == 200:
                data = response.json()
                address = data.get("address", {})

                city = (
                    address.get("city") or address.get("town") or
                    address.get("village") or address.get("hamlet") or ""
                )
                country = address.get("country") or ""
                raw = data.get("display_name", "")

                # Check if Nominatim itself landed on a museum feature
                # data["type"] is the OSM tag value (e.g. "museum", "tertiary")
                # address["tourism"] holds the venue name when type=museum
                osm_type = data.get("type", "").lower()
                tourism_tag = address.get("tourism", "").lower()
                amenity_tag = address.get("amenity", "").lower()
                if osm_type in _MUSEUM_OSM_VALUES:
                    museum = data.get("name") or address.get("tourism") or ""
                elif tourism_tag in _MUSEUM_OSM_VALUES or amenity_tag in _MUSEUM_OSM_VALUES:
                    museum = address.get("tourism") or address.get("amenity") or data.get("name") or ""

    except Exception as e:
        logger.warning(f"Nominatim reverse geocode failed: {e}")

    # Overpass fallback — GPS may have landed on a road inside a museum campus
    if not museum:
        museum = await _find_museum_nearby(lat, lon)

    return {
        "city": city,
        "country": country,
        "museum": museum,
        "latitude": lat,
        "longitude": lon,
        "raw": raw,
    }

async def extract_image_metadata(image: Image.Image, filename: str, file_size: int) -> Dict[str, Any]:
    """Extract metadata from PIL Image"""
    
    metadata = {
        "filename": filename,
        "size": file_size,
        "dimensions": image.size,
        "format": image.format or "Unknown",
        "upload_timestamp": datetime.utcnow().isoformat(),
        "exif_location": None,
        "exif_timestamp": None
    }
    
    # Extract EXIF data if available
    exif_data = {}
    if hasattr(image, '_getexif') and image._getexif() is not None:
        exif = image._getexif()
        for tag_id, value in exif.items():
            tag = ExifTags.TAGS.get(tag_id, tag_id)
            if tag in ['DateTime', 'DateTimeOriginal', 'DateTimeDigitized', 'Software', 'ColorSpace', 'Orientation']:
                exif_data[tag] = str(value)
                if tag == 'DateTimeOriginal' and not metadata["exif_timestamp"]:
                    metadata["exif_timestamp"] = _format_exif_date(str(value))
            
            # GPS Data
            if tag == 'GPSInfo':
                gps_data = {}
                for t in value:
                    sub_tag = ExifTags.GPSTAGS.get(t, t)
                    gps_data[sub_tag] = value[t]
                
                try:
                    if 'GPSLatitude' in gps_data and 'GPSLatitudeRef' in gps_data and \
                       'GPSLongitude' in gps_data and 'GPSLongitudeRef' in gps_data:
                        lat = _convert_to_degrees(gps_data['GPSLatitude'])
                        if gps_data['GPSLatitudeRef'] != 'N':
                            lat = 0 - lat
                        
                        lon = _convert_to_degrees(gps_data['GPSLongitude'])
                        if gps_data['GPSLongitudeRef'] != 'E':
                            lon = 0 - lon
                        
                        metadata["exif_location"] = {"latitude": lat, "longitude": lon}

                        # Trigger reverse geocoding if we have coordinates
                        # Note: This is an async call but extract_image_metadata is now async
                        metadata["location_data"] = await reverse_geocode(lat, lon)

                        # Tag the source so the venue resolver treats this as an
                        # EXIF capture, and carry the horizontal accuracy through
                        # (both live in the location JSON the resolver reads).
                        metadata["location_data"]["source"] = "image_exif"
                        accuracy_m = _gps_accuracy_meters(gps_data)
                        if accuracy_m is not None:
                            metadata["location_data"]["accuracy_meters"] = accuracy_m
                            metadata["exif_location"]["accuracy_meters"] = accuracy_m

                except Exception as e:
                    logger.warning(f"Failed to parse GPS data: {e}")
    
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


