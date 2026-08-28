from app.services.museum.geometry import (
    footprint_bounds,
    footprint_contains,
    footprint_distance_meters,
    footprint_geojson_from_osm_element,
)


WAY_GEOMETRY = [
    {"lat": 37.0, "lon": -122.0},
    {"lat": 37.0, "lon": -121.9},
    {"lat": 37.1, "lon": -121.9},
    {"lat": 37.1, "lon": -122.0},
    {"lat": 37.0, "lon": -122.0},
]


def test_builds_way_polygon_and_tests_containment():
    footprint = footprint_geojson_from_osm_element({"type": "way", "geometry": WAY_GEOMETRY})

    assert footprint is not None
    assert footprint["type"] == "Polygon"
    assert footprint_contains(footprint, latitude=37.05, longitude=-121.95) is True
    assert footprint_contains(footprint, latitude=37.2, longitude=-121.95) is False
    assert footprint_bounds(footprint) == (37.0, 37.1, -122.0, -121.9)
    assert footprint_distance_meters(
        footprint,
        latitude=37.05,
        longitude=-122.00005,
    ) < 5


def test_builds_relation_polygon_from_joined_outer_segments():
    element = {
        "type": "relation",
        "members": [
            {"type": "way", "role": "outer", "geometry": WAY_GEOMETRY[:3]},
            {"type": "way", "role": "outer", "geometry": WAY_GEOMETRY[2:]},
        ],
    }

    footprint = footprint_geojson_from_osm_element(element)

    assert footprint is not None
    assert footprint_contains(footprint, latitude=37.05, longitude=-121.95) is True


def test_relation_hole_is_not_contained():
    inner = [
        {"lat": 37.04, "lon": -121.96},
        {"lat": 37.04, "lon": -121.94},
        {"lat": 37.06, "lon": -121.94},
        {"lat": 37.06, "lon": -121.96},
        {"lat": 37.04, "lon": -121.96},
    ]
    element = {
        "type": "relation",
        "members": [
            {"type": "way", "role": "outer", "geometry": WAY_GEOMETRY},
            {"type": "way", "role": "inner", "geometry": inner},
        ],
    }

    footprint = footprint_geojson_from_osm_element(element)

    assert footprint is not None
    assert footprint_contains(footprint, latitude=37.02, longitude=-121.98) is True
    assert footprint_contains(footprint, latitude=37.05, longitude=-121.95) is False


def test_nodes_and_open_ways_have_no_footprint():
    assert footprint_geojson_from_osm_element({"type": "node", "lat": 37, "lon": -122}) is None
    assert footprint_geojson_from_osm_element(
        {"type": "way", "geometry": WAY_GEOMETRY[:-1]},
    ) is None
