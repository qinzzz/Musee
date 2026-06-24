from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel

from app.services.artwork_analysis_service import image_url_to_bytes


class ExhibitionItem(BaseModel):
    id: str
    url: str
    keywords: List[str] = []
    artist_name: Optional[str] = None
    artwork_name: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    medium: Optional[str] = None


class VisitChatRequest(BaseModel):
    items: List[ExhibitionItem]
    conversation_history: List[Dict[str, str]]
    new_message: str


def build_visit_items_payload(items: List[ExhibitionItem]) -> List[Dict[str, List[str]]]:
    return [{"keywords": item.keywords} for item in items]


async def load_bootstrap_image_bytes(
    items: List[ExhibitionItem],
    conversation_history: List[Dict[str, str]],
) -> List[bytes]:
    if conversation_history or not items:
        return []

    image_bytes_list: List[bytes] = []
    for item in items[:10]:
        image_bytes = await image_url_to_bytes(item.url)
        if image_bytes:
            image_bytes_list.append(image_bytes)
    return image_bytes_list
