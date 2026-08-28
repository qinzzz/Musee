from __future__ import annotations

import math
from typing import Any, Iterable, Mapping, Optional, Sequence


Coordinate = tuple[float, float]
Ring = list[Coordinate]
MAX_FOOTPRINT_BUFFER_METERS = 30.0
DEFAULT_FOOTPRINT_BUFFER_METERS = 30.0
MIN_FOOTPRINT_BUFFER_METERS = 10.0


def footprint_match_buffer(accuracy_meters: Optional[float]) -> float:
    return min(
        MAX_FOOTPRINT_BUFFER_METERS,
        max(
            MIN_FOOTPRINT_BUFFER_METERS,
            accuracy_meters or DEFAULT_FOOTPRINT_BUFFER_METERS,
        ),
    )


def _coordinate_pair(point: Mapping[str, Any]) -> Optional[Coordinate]:
    latitude = point.get("lat")
    longitude = point.get("lon")
    if latitude is None or longitude is None:
        return None
    return float(longitude), float(latitude)


def _closed_ring(points: Iterable[Mapping[str, Any]]) -> Optional[Ring]:
    ring = [coordinate for point in points if (coordinate := _coordinate_pair(point))]
    if len(ring) < 4 or ring[0] != ring[-1]:
        return None
    return ring


def _join_segments(segments: list[Ring]) -> list[Ring]:
    remaining = [segment[:] for segment in segments if len(segment) >= 2]
    rings: list[Ring] = []
    while remaining:
        ring = remaining.pop(0)
        while ring[0] != ring[-1]:
            match_index = None
            prepend = False
            reverse = False
            for index, segment in enumerate(remaining):
                if ring[-1] == segment[0]:
                    match_index = index
                    break
                if ring[-1] == segment[-1]:
                    match_index = index
                    reverse = True
                    break
                if ring[0] == segment[-1]:
                    match_index = index
                    prepend = True
                    break
                if ring[0] == segment[0]:
                    match_index = index
                    prepend = True
                    reverse = True
                    break
            if match_index is None:
                break
            segment = remaining.pop(match_index)
            if reverse:
                segment.reverse()
            if prepend:
                ring = segment[:-1] + ring
            else:
                ring.extend(segment[1:])
        if len(ring) >= 4 and ring[0] == ring[-1]:
            rings.append(ring)
    return rings


def _relation_rings(element: Mapping[str, Any], role: str) -> list[Ring]:
    closed: list[Ring] = []
    open_segments: list[Ring] = []
    for member in element.get("members", []):
        if member.get("type") != "way" or member.get("role", "outer") != role:
            continue
        points = member.get("geometry") or []
        coordinates = [
            coordinate for point in points if (coordinate := _coordinate_pair(point))
        ]
        if len(coordinates) < 2:
            continue
        if len(coordinates) >= 4 and coordinates[0] == coordinates[-1]:
            closed.append(coordinates)
        else:
            open_segments.append(coordinates)
    return closed + _join_segments(open_segments)


def point_in_ring(longitude: float, latitude: float, ring: Sequence[Coordinate]) -> bool:
    inside = False
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1)
        if abs(cross) < 1e-12 and min(x1, x2) <= longitude <= max(x1, x2) and min(y1, y2) <= latitude <= max(y1, y2):
            return True
        if (y1 > latitude) != (y2 > latitude):
            crossing_x = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < crossing_x:
                inside = not inside
    return inside


def footprint_geojson_from_osm_element(element: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    element_type = element.get("type")
    if element_type == "way":
        ring = _closed_ring(element.get("geometry") or [])
        return {"type": "Polygon", "coordinates": [ring]} if ring else None
    if element_type != "relation":
        return None

    outer_rings = _relation_rings(element, "outer")
    if not outer_rings:
        return None
    inner_rings = _relation_rings(element, "inner")
    polygons: list[list[Ring]] = [[outer] for outer in outer_rings]
    for inner in inner_rings:
        sample_longitude, sample_latitude = inner[0]
        for polygon in polygons:
            if point_in_ring(sample_longitude, sample_latitude, polygon[0]):
                polygon.append(inner)
                break
    if len(polygons) == 1:
        return {"type": "Polygon", "coordinates": polygons[0]}
    return {"type": "MultiPolygon", "coordinates": polygons}


def footprint_contains(
    footprint: Mapping[str, Any],
    *,
    latitude: float,
    longitude: float,
) -> bool:
    geometry_type = footprint.get("type")
    coordinates = footprint.get("coordinates") or []
    polygons = [coordinates] if geometry_type == "Polygon" else coordinates
    if geometry_type not in {"Polygon", "MultiPolygon"}:
        return False
    for polygon in polygons:
        if not polygon or not point_in_ring(longitude, latitude, polygon[0]):
            continue
        if any(point_in_ring(longitude, latitude, hole) for hole in polygon[1:]):
            continue
        return True
    return False


def footprint_bounds(footprint: Mapping[str, Any]) -> Optional[tuple[float, float, float, float]]:
    coordinates: list[Coordinate] = []

    def collect(value: Any) -> None:
        if (
            isinstance(value, (list, tuple))
            and len(value) == 2
            and all(isinstance(item, (int, float)) for item in value)
        ):
            coordinates.append((float(value[0]), float(value[1])))
            return
        if isinstance(value, (list, tuple)):
            for item in value:
                collect(item)

    collect(footprint.get("coordinates"))
    if not coordinates:
        return None
    longitudes = [coordinate[0] for coordinate in coordinates]
    latitudes = [coordinate[1] for coordinate in coordinates]
    return min(latitudes), max(latitudes), min(longitudes), max(longitudes)


def footprint_distance_meters(
    footprint: Mapping[str, Any],
    *,
    latitude: float,
    longitude: float,
) -> float:
    if footprint_contains(footprint, latitude=latitude, longitude=longitude):
        return 0.0

    latitude_scale = 111_320.0
    longitude_scale = latitude_scale * max(abs(math.cos(math.radians(latitude))), 0.01)
    shortest = float("inf")

    def inspect_ring(ring: Sequence[Sequence[float]]) -> None:
        nonlocal shortest
        for index in range(len(ring) - 1):
            start_longitude, start_latitude = ring[index]
            end_longitude, end_latitude = ring[index + 1]
            start_x = (float(start_longitude) - longitude) * longitude_scale
            start_y = (float(start_latitude) - latitude) * latitude_scale
            end_x = (float(end_longitude) - longitude) * longitude_scale
            end_y = (float(end_latitude) - latitude) * latitude_scale
            segment_x = end_x - start_x
            segment_y = end_y - start_y
            segment_length_squared = segment_x * segment_x + segment_y * segment_y
            if segment_length_squared == 0:
                distance = math.hypot(start_x, start_y)
            else:
                projection = -(start_x * segment_x + start_y * segment_y) / segment_length_squared
                projection = min(1.0, max(0.0, projection))
                distance = math.hypot(
                    start_x + projection * segment_x,
                    start_y + projection * segment_y,
                )
            shortest = min(shortest, distance)

    geometry_type = footprint.get("type")
    coordinates = footprint.get("coordinates") or []
    polygons = [coordinates] if geometry_type == "Polygon" else coordinates
    if geometry_type not in {"Polygon", "MultiPolygon"}:
        return shortest
    for polygon in polygons:
        for ring in polygon:
            inspect_ring(ring)
    return shortest
