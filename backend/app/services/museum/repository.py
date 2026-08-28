from __future__ import annotations

import math
from typing import List, Tuple

from sqlalchemy.orm import Session

from app.database.models import MuseumEntity
from app.services.museum.geometry import footprint_distance_meters


EARTH_RADIUS_METERS = 6_371_000.0
METERS_PER_LATITUDE_DEGREE = 111_320.0


def find_museum_footprint_matches(
    db: Session,
    *,
    latitude: float,
    longitude: float,
    buffer_meters: float,
) -> list[tuple[MuseumEntity, float]]:
    latitude_delta = buffer_meters / METERS_PER_LATITUDE_DEGREE
    longitude_scale = max(abs(math.cos(math.radians(latitude))), 0.01)
    longitude_delta = buffer_meters / (METERS_PER_LATITUDE_DEGREE * longitude_scale)
    candidates = (
        db.query(MuseumEntity)
        .filter(
            MuseumEntity.status == "active",
            MuseumEntity.is_physical_venue.is_(True),
            MuseumEntity.resolution_eligible.is_(True),
            MuseumEntity.footprint_geojson.isnot(None),
            MuseumEntity.footprint_min_latitude <= latitude + latitude_delta,
            MuseumEntity.footprint_max_latitude >= latitude - latitude_delta,
            MuseumEntity.footprint_min_longitude <= longitude + longitude_delta,
            MuseumEntity.footprint_max_longitude >= longitude - longitude_delta,
        )
        .all()
    )
    matches = [
        (
            museum,
            footprint_distance_meters(
                museum.footprint_geojson,
                latitude=latitude,
                longitude=longitude,
            ),
        )
        for museum in candidates
    ]
    return sorted(
        ((museum, distance) for museum, distance in matches if distance <= buffer_meters),
        key=lambda item: item[1],
    )


def haversine_distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    latitude_a_radians = math.radians(latitude_a)
    latitude_b_radians = math.radians(latitude_b)
    latitude_delta = math.radians(latitude_b - latitude_a)
    longitude_delta = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(latitude_delta / 2) ** 2
        + math.cos(latitude_a_radians)
        * math.cos(latitude_b_radians)
        * math.sin(longitude_delta / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(haversine))


def find_museums_nearby(
    db: Session,
    *,
    latitude: float,
    longitude: float,
    radius_meters: float,
) -> List[Tuple[MuseumEntity, float]]:
    latitude_delta = radius_meters / METERS_PER_LATITUDE_DEGREE
    longitude_scale = max(abs(math.cos(math.radians(latitude))), 0.01)
    longitude_delta = radius_meters / (METERS_PER_LATITUDE_DEGREE * longitude_scale)

    candidates = (
        db.query(MuseumEntity)
        .filter(
            MuseumEntity.status == "active",
            MuseumEntity.is_physical_venue.is_(True),
            MuseumEntity.resolution_eligible.is_(True),
            MuseumEntity.latitude.between(latitude - latitude_delta, latitude + latitude_delta),
            MuseumEntity.longitude.between(longitude - longitude_delta, longitude + longitude_delta),
        )
        .all()
    )
    nearby = [
        (
            museum,
            haversine_distance_meters(latitude, longitude, museum.latitude, museum.longitude),
        )
        for museum in candidates
    ]
    return sorted(
        ((museum, distance) for museum, distance in nearby if distance <= radius_meters),
        key=lambda item: item[1],
    )
