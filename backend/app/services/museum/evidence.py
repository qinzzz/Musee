from __future__ import annotations

from typing import Any, Mapping, Optional

from app.services.museum.contracts import MuseumEvidenceSource, MuseumResolutionEvidence


SUPPORTED_EVIDENCE_SOURCES = {"device_live", "image_exif", "legacy_artwork_location"}


def _optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def museum_evidence_from_location(
    location: Any,
    *,
    artwork_id: Optional[str] = None,
) -> Optional[MuseumResolutionEvidence]:
    if not isinstance(location, Mapping):
        return None

    latitude = _optional_float(location.get("latitude"))
    longitude = _optional_float(location.get("longitude"))
    source = location.get("source")
    if latitude is None or longitude is None or source not in SUPPORTED_EVIDENCE_SOURCES:
        return None

    return MuseumResolutionEvidence(
        artwork_id=artwork_id,
        latitude=latitude,
        longitude=longitude,
        accuracy_meters=_optional_float(location.get("accuracy_meters")),
        observed_at=str(location.get("position_timestamp") or "") or None,
        source=source,  # type: ignore[arg-type]
    )
