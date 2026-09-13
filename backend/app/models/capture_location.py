from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PlaceMatchHint(BaseModel):
    """Transient MapKit evidence; never persisted or added to event payloads."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=300)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class CaptureLocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: Literal["selected", "removed"]
    source: Literal["manual", "apple_maps", "museum"] | None = None
    name: str | None = Field(default=None, min_length=1, max_length=300)
    place_id: str | None = Field(default=None, min_length=1, max_length=300)
    museum_id: str | None = Field(default=None, min_length=1, max_length=100)
    match_hint: PlaceMatchHint | None = None

    @model_validator(mode="after")
    def check_shape(self):
        if self.status == "removed":
            if any(v is not None for v in (self.source, self.name, self.place_id, self.museum_id, self.match_hint)):
                raise ValueError("Removal cannot include a place.")
        elif self.source == "manual":
            if not self.name or any(v is not None for v in (self.place_id, self.museum_id, self.match_hint)):
                raise ValueError("Manual places need only a name.")
        elif self.source == "apple_maps":
            if not self.place_id or self.name is not None or self.museum_id is not None:
                raise ValueError("Apple places need a place identifier, not stored place details.")
        elif self.source == "museum":
            if not self.museum_id or any(v is not None for v in (self.name, self.place_id, self.match_hint)):
                raise ValueError("Museum selections need only a museum identifier.")
        else:
            raise ValueError("Select a place source.")
        return self
