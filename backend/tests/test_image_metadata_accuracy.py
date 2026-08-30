"""EXIF GPS accuracy capture: source tag + accuracy_meters land in location JSON."""
import pytest
from PIL import Image

from app.utils import image_processing
from app.utils.image_processing import _gps_accuracy_meters, extract_image_metadata

# EXIF GPS IFD numeric sub-tags
GPS_LAT_REF, GPS_LAT = 1, 2
GPS_LON_REF, GPS_LON = 3, 4
GPS_HPOS_ERROR = 31
GPSINFO_TAG = 34853


def _image_with_gps(gps_ifd):
    img = Image.new("RGB", (8, 8))
    img._getexif = lambda: {GPSINFO_TAG: gps_ifd}  # type: ignore[attr-defined]
    return img


@pytest.mark.parametrize("raw, expected", [
    (12.5, 12.5),
    (0, None),        # 0 is not a meaningful accuracy
    (-3, None),
    (None, None),
    ("bad", None),
])
def test_gps_accuracy_helper(raw, expected):
    gps = {"GPSHPositioningError": raw} if raw is not None else {}
    assert _gps_accuracy_meters(gps) == expected


@pytest.mark.asyncio
async def test_exif_gps_sets_source_and_accuracy(monkeypatch):
    async def fake_geocode(lat, lon):
        return {"latitude": lat, "longitude": lon, "museum": "", "city": "", "country": ""}
    monkeypatch.setattr(image_processing, "reverse_geocode", fake_geocode)

    img = _image_with_gps({
        GPS_LAT_REF: "N", GPS_LAT: (37, 47, 8.0),
        GPS_LON_REF: "W", GPS_LON: (122, 24, 3.0),
        GPS_HPOS_ERROR: 12.5,
    })
    meta = await extract_image_metadata(img, "photo.jpg", 1000)

    loc = meta["location_data"]
    assert loc["source"] == "image_exif"
    assert loc["accuracy_meters"] == 12.5
    assert meta["exif_location"]["accuracy_meters"] == 12.5


@pytest.mark.asyncio
async def test_exif_gps_without_accuracy_still_tags_source(monkeypatch):
    async def fake_geocode(lat, lon):
        return {"latitude": lat, "longitude": lon}
    monkeypatch.setattr(image_processing, "reverse_geocode", fake_geocode)

    img = _image_with_gps({
        GPS_LAT_REF: "N", GPS_LAT: (37, 47, 8.0),
        GPS_LON_REF: "W", GPS_LON: (122, 24, 3.0),
    })  # no GPSHPositioningError
    meta = await extract_image_metadata(img, "photo.jpg", 1000)

    assert meta["location_data"]["source"] == "image_exif"
    assert "accuracy_meters" not in meta["location_data"]
