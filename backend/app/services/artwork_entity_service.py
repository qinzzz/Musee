from __future__ import annotations

import re

from app.database.models import ArtistEntity, ArtworkEntity


def normalize_entity_name(value: str) -> str:
    normalized = value.lower().strip()
    if normalized.startswith("the "):
        normalized = normalized[4:]
    return re.sub(r"\s+", " ", normalized)


def upsert_artwork_entity(db, artist_name: str, artwork_name: str) -> ArtworkEntity:
    canonical_artist = normalize_entity_name(artist_name)
    canonical_title = normalize_entity_name(artwork_name)
    entity = db.query(ArtworkEntity).filter_by(
        canonical_artist=canonical_artist,
        canonical_title=canonical_title,
    ).first()
    if entity:
        entity.instance_count = (entity.instance_count or 0) + 1
        return entity

    entity = ArtworkEntity(
        canonical_artist=canonical_artist,
        canonical_title=canonical_title,
        display_artist=artist_name.strip(),
        display_title=artwork_name.strip(),
        instance_count=1,
    )
    db.add(entity)
    return entity


def upsert_artist_entity(db, artist_name: str) -> ArtistEntity:
    canonical_name = normalize_entity_name(artist_name)
    entity = db.query(ArtistEntity).filter_by(canonical_name=canonical_name).first()
    if entity:
        return entity

    entity = ArtistEntity(
        canonical_name=canonical_name,
        display_name=artist_name.strip(),
        bio_status="pending",
    )
    db.add(entity)
    return entity
