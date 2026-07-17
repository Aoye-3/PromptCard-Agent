from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.gateway.model_management.contracts import ModelModality

IntegrationKind = Literal["pi-native", "sdk"]


@dataclass(frozen=True)
class IntegrationGroup:
    id: str
    display_name: str
    kind: IntegrationKind

    def response(self) -> dict[str, str]:
        return {
            "id": self.id,
            "displayName": self.display_name,
            "kind": self.kind,
        }


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    display_name: str
    default_api_base: str
    integration_groups: dict[ModelModality, IntegrationGroup]
    probe_path: str

    def group_for(self, modality: ModelModality) -> IntegrationGroup | None:
        return self.integration_groups.get(modality)

    def response(self) -> dict[str, object]:
        return {
            "id": self.id,
            "displayName": self.display_name,
            "defaultApiBase": self.default_api_base,
            "integrationGroups": {
                modality: group.response()
                for modality, group in self.integration_groups.items()
            },
        }


PI_NATIVE_GROUP = IntegrationGroup(
    id="pi-native",
    display_name="PI 原生",
    kind="pi-native",
)
ARK_SDK_GROUP = IntegrationGroup(
    id="volcengine-ark-sdk",
    display_name="方舟 SDK",
    kind="sdk",
)

PROVIDER_DEFINITIONS: tuple[ProviderDefinition, ...] = (
    ProviderDefinition(
        id="deepseek",
        display_name="DeepSeek",
        default_api_base="https://api.deepseek.com",
        integration_groups={"chat": PI_NATIVE_GROUP},
        probe_path="/models",
    ),
    ProviderDefinition(
        id="volcengine-ark",
        display_name="Volcengine Ark",
        default_api_base="https://ark.cn-beijing.volces.com/api/v3",
        integration_groups={"chat": ARK_SDK_GROUP, "image": ARK_SDK_GROUP},
        probe_path="/ping",
    ),
)

_PROVIDERS_BY_ID = {provider.id: provider for provider in PROVIDER_DEFINITIONS}


def provider_definition(provider_id: str) -> ProviderDefinition | None:
    return _PROVIDERS_BY_ID.get(provider_id)


def provider_exists(provider_id: str) -> bool:
    return provider_id in _PROVIDERS_BY_ID


def provider_responses() -> list[dict[str, object]]:
    return [provider.response() for provider in PROVIDER_DEFINITIONS]
