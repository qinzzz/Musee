from pydantic import BaseModel
from typing import Optional, List


class CollectionBase(BaseModel):
    name: str
    description: Optional[str] = None


class CollectionCreate(CollectionBase):
    user_id: str
    artwork_ids: Optional[List[str]] = []


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    artwork_ids: Optional[List[str]] = None
