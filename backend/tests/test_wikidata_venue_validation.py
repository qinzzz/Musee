import pytest

from app.services.museum.wikidata_validation import (
    ProviderVenueEvidence,
    clear_wikidata_validation_cache,
    validate_wikidata_venue,
)


def _item_claim(qid: str):
    return {"mainsnak": {"datavalue": {"value": {"id": qid}}}}


def _coordinate_claim(latitude: float, longitude: float):
    return {"mainsnak": {"datavalue": {"value": {"latitude": latitude, "longitude": longitude}}}}


def _entity(name: str, *, instances=(), coordinate=None, children=(), parents=(), subclass_of=()):
    claims = {
        "P31": [_item_claim(qid) for qid in instances],
        "P527": [_item_claim(qid) for qid in children],
        "P361": [_item_claim(qid) for qid in parents],
        "P279": [_item_claim(qid) for qid in subclass_of],
    }
    if coordinate:
        claims["P625"] = [_coordinate_claim(*coordinate)]
    return {"labels": {"en": {"value": name}}, "claims": claims}


class FakeWikidataClient:
    def __init__(self, entities):
        self.entities = entities

    async def get_entities(self, qids):
        return {qid: self.entities[qid] for qid in qids if qid in self.entities}


@pytest.fixture(autouse=True)
def clear_class_cache():
    clear_wikidata_validation_cache()


@pytest.mark.asyncio
async def test_physical_leaf_is_eligible():
    client = FakeWikidataClient({
        "QDEYOUNG": _entity("de Young", instances=("Q207694",), coordinate=(37.7715, -122.4687)),
    })

    result = await validate_wikidata_venue("QDEYOUNG", client=client)

    assert result.status == "eligible"
    assert result.resolution_eligible is True
    assert result.has_child_venues is False


@pytest.mark.asyncio
async def test_pure_organization_sharing_child_coordinates_is_rejected():
    client = FakeWikidataClient({
        "QORG": _entity(
            "Fine Arts Museums of San Francisco",
            instances=("Q33506",),
            coordinate=(37.7715, -122.4687),
            children=("QCHILD",),
        ),
        "QCHILD": _entity("de Young", instances=("Q207694",), coordinate=(37.7715, -122.4687)),
    })

    result = await validate_wikidata_venue("QORG", client=client)

    assert result.status == "rejected"
    assert result.resolution_eligible is False
    assert result.reason_codes == ("pure_organization_shared_coordinates_with_child",)


@pytest.mark.asyncio
async def test_physical_flagship_with_children_remains_eligible_with_osm_evidence():
    client = FakeWikidataClient({
        "QMET": _entity(
            "The Metropolitan Museum of Art",
            instances=("Q33506",),
            coordinate=(40.7794, -73.9632),
            children=("QCLOISTERS",),
        ),
        "QCLOISTERS": _entity(
            "The Met Cloisters", instances=("Q207694",), coordinate=(40.8649, -73.9319),
        ),
    })
    evidence = ProviderVenueEvidence(
        provider="osm", provider_id="way/1", name="The Met",
        latitude=40.7794, longitude=-73.9632, tourism_kind="museum", wikidata_qid="QMET",
    )

    result = await validate_wikidata_venue("QMET", provider_evidence=evidence, client=client)

    assert result.status == "eligible"
    assert result.resolution_eligible is True
    assert result.has_child_venues is True
    assert "physical_flagship_with_child_venues" in result.reason_codes


@pytest.mark.asyncio
async def test_parent_sharing_coordinates_resolves_to_nearest_physical_child():
    client = FakeWikidataClient({
        "QGETTY": _entity(
            "J. Paul Getty Museum",
            instances=("Q33506",),
            coordinate=(34.0775, -118.4750),
            children=("QCENTER", "QVILLA"),
        ),
        "QCENTER": _entity(
            "Getty Center", instances=("Q33506",), coordinate=(34.0775, -118.4750),
            parents=("QGETTY",),
        ),
        "QVILLA": _entity(
            "Getty Villa", instances=("Q207694",), coordinate=(34.0450, -118.5650),
            parents=("QGETTY",),
        ),
    })
    evidence = ProviderVenueEvidence(
        provider="osm", provider_id="node/1", name="J. Paul Getty Museum",
        latitude=34.0770, longitude=-118.4740, tourism_kind="museum", wikidata_qid="QGETTY",
        capture_latitude=34.07645, capture_longitude=-118.47346,
    )

    result = await validate_wikidata_venue("QGETTY", provider_evidence=evidence, client=client)

    assert result.status == "eligible"
    assert result.qid == "QCENTER"
    assert result.canonical_name == "Getty Center"
    assert result.parent_wikidata_qid == "QGETTY"
    assert result.has_child_venues is False
    assert result.reason_codes[0] == "resolved_to_nearest_shared_child_venue"


@pytest.mark.asyncio
async def test_incompatible_entity_type_is_rejected():
    client = FakeWikidataClient({
        "QTUNNEL": _entity("Tunnel", instances=("QTUNNELCLASS",), coordinate=(48.86, 2.33)),
        "QTUNNELCLASS": _entity("tunnel"),
    })

    result = await validate_wikidata_venue("QTUNNEL", client=client)

    assert result.status == "rejected"
    assert result.reason_codes == ("incompatible_institution_type",)


@pytest.mark.asyncio
async def test_unknown_subclass_is_resolved_through_p279():
    client = FakeWikidataClient({
        "QHISTORY": _entity("History Museum", instances=("QHISTORYCLASS",), coordinate=(37.78, -122.4)),
        "QHISTORYCLASS": _entity("history museum", subclass_of=("Q33506",)),
    })

    result = await validate_wikidata_venue("QHISTORY", client=client)

    assert result.status == "eligible"
