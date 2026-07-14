from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ModelModality = Literal["chat", "image"]
ModelSlot = Literal["chat.primary", "image.primary"]


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ConnectionRequest(CamelModel):
    provider_id: str = Field(alias="providerId")
    display_name: str = Field(alias="displayName")
    api_base: str = Field(alias="apiBase")
    enabled: bool = True
    credential: str | None = None


class AssignmentRequest(CamelModel):
    connection_id: str = Field(alias="connectionId")
    model_id: str = Field(alias="modelId")
