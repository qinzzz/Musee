from app.database.models import MuseumEntity
from app.services.museum.wikidata_importer import (
    MUSEUM_REGIONS,
    SAN_FRANCISCO_MUSEUM_QUERY,
    WikidataMuseumRecord,
    build_museum_region_query,
    import_museum_records,
    parse_wikidata_museum_bindings,
)


def _binding(
    qid: str,
    name: str,
    longitude: float,
    latitude: float,
    country_code: str = "US",
):
    return {
        "museum": {"value": f"http://www.wikidata.org/entity/{qid}"},
        "museumLabel": {"value": name},
        "coord": {"value": f"Point({longitude} {latitude})"},
        "countryCode": {"value": country_code},
    }


def test_query_is_bounded_and_limited_to_museum_subclasses():
    assert "wikibase:box" in SAN_FRANCISCO_MUSEUM_QUERY
    assert "wd:Q33506" in SAN_FRANCISCO_MUSEUM_QUERY
    assert "wd:Q1007870" not in SAN_FRANCISCO_MUSEUM_QUERY
    assert "wdt:P576" in SAN_FRANCISCO_MUSEUM_QUERY


def test_region_queries_use_the_selected_reviewed_boundary():
    new_york_query = build_museum_region_query(MUSEUM_REGIONS["new-york"])
    los_angeles_query = build_museum_region_query(MUSEUM_REGIONS["los-angeles"])

    assert "Point(-74.26 40.49)" in new_york_query
    assert "Point(-73.7 40.92)" in new_york_query
    assert "Point(-118.68 33.7)" in los_angeles_query
    assert "Point(-118.15 34.34)" in los_angeles_query


def test_parser_validates_against_the_selected_region():
    records, skipped = parse_wikidata_museum_bindings(
        [
            _binding("Q89503830", "The Met Fifth Avenue", -73.9632, 40.7794),
            _binding("Q913672", "SFMOMA", -122.4009, 37.7857),
        ],
        region=MUSEUM_REGIONS["new-york"],
    )

    assert [record.qid for record in records] == ["Q89503830"]
    assert skipped == 1


def test_region_parser_excludes_reviewed_umbrella_entities():
    records, skipped = parse_wikidata_museum_bindings(
        [
            _binding("Q160236", "Metropolitan Museum of Art", -73.9633, 40.7794),
            _binding("Q89503830", "The Met Fifth Avenue", -73.9632, 40.7795),
        ],
        region=MUSEUM_REGIONS["new-york"],
    )

    assert [record.qid for record in records] == ["Q89503830"]
    assert skipped == 1


def test_parses_deduplicates_and_validates_wikidata_bindings():
    records, skipped = parse_wikidata_museum_bindings(
        [
            _binding("Q913672", "San Francisco Museum of Modern Art", -122.4009, 37.7857),
            _binding("Q913672", "SFMOMA", -122.4009, 37.7857),
            _binding("Q1416890", "Fine Arts Museums of San Francisco", -122.468694, 37.7715),
            _binding("Q1", "Outside San Francisco", -122.2711, 37.8044),
            _binding("bad-id", "Invalid", -122.4, 37.78),
        ]
    )

    assert records == [
        WikidataMuseumRecord(
            qid="Q913672",
            canonical_name="SFMOMA",
            latitude=37.7857,
            longitude=-122.4009,
            country_code="US",
        )
    ]
    assert skipped == 3


def test_import_is_dry_run_by_default(db):
    records = [
        WikidataMuseumRecord("Q913672", "SFMOMA", 37.7857, -122.4009, "US"),
    ]

    summary = import_museum_records(db, records)

    assert summary.dry_run is True
    assert summary.inserted == 1
    assert db.query(MuseumEntity).count() == 0


def test_import_inserts_then_updates_by_wikidata_qid(db):
    original = WikidataMuseumRecord("Q913672", "SFMOMA", 37.7857, -122.4009, "US")
    inserted = import_museum_records(db, [original], dry_run=False)

    assert inserted.inserted == 1
    assert db.query(MuseumEntity).count() == 1

    changed = WikidataMuseumRecord(
        "Q913672",
        "San Francisco Museum of Modern Art",
        37.7858,
        -122.4010,
        "US",
    )
    updated = import_museum_records(db, [changed], dry_run=False)
    museum = db.query(MuseumEntity).one()

    assert updated.updated == 1
    assert db.query(MuseumEntity).count() == 1
    assert museum.canonical_name == "San Francisco Museum of Modern Art"
    assert museum.latitude == 37.7858


def test_import_reports_unchanged_records(db):
    record = WikidataMuseumRecord("Q913672", "SFMOMA", 37.7857, -122.4009, "US")
    import_museum_records(db, [record], dry_run=False)

    summary = import_museum_records(db, [record], dry_run=False)

    assert summary.unchanged == 1
    assert summary.inserted == 0
    assert summary.updated == 0
