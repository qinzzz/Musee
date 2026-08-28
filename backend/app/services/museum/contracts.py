from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional


MuseumEvidenceSource = Literal["device_live", "image_exif", "legacy_artwork_location"]
MuseumResolutionStatus = Literal["resolved", "unresolved", "ambiguous", "invalid_evidence"]


@dataclass(frozen=True)
class MuseumResolutionEvidence:
    latitude: float
    longitude: float
    source: MuseumEvidenceSource
    accuracy_meters: Optional[float] = None
    observed_at: Optional[str] = None
    artwork_id: Optional[str] = None


@dataclass(frozen=True)
class MuseumResolutionResult:
    status: MuseumResolutionStatus
    museum_entity_id: Optional[str] = None
    distance_meters: Optional[float] = None
    reason: Optional[str] = None
