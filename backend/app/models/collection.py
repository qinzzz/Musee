from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, List


class CollectionBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class CollectionCreate(CollectionBase):
    user_id: str
    artwork_ids: Optional[List[str]] = []


class CollectionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    artwork_ids: Optional[List[str]] = None

    add_artwork_ids: Optional[List[str]] = None
    remove_artwork_ids: Optional[List[str]] = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_membership_update(self):
        if self.artwork_ids is not None and (self.add_artwork_ids is not None or self.remove_artwork_ids is not None):
            raise ValueError("Use either replacement or membership changes")
        if set(self.add_artwork_ids or []) & set(self.remove_artwork_ids or []):
            raise ValueError("An artwork cannot be added and removed together")
        return self
