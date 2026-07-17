from __future__ import annotations

from typing import Any

from app.gateway.model_management.catalog import (
    connection_models_response,
    model_by_id,
)
from app.gateway.model_management.connection_store import (
    ModelManagementError,
    get_connection_store,
)
from app.gateway.model_management.provider_registry import provider_definition
from app.gateway.text_generation.providers.base import TextProviderAdapter
from app.gateway.text_generation.providers.volcengine_ark import (
    VolcengineArkTextAdapter,
)

_SDK_ADAPTERS: dict[str, TextProviderAdapter] = {
    "volcengine-ark": VolcengineArkTextAdapter(),
}


def assigned_text_model() -> dict[str, Any]:
    store = get_connection_store()
    assignment = store.assignment("chat.primary")
    if assignment is None:
        raise ModelManagementError("assignment_not_found")
    connection_id = str(assignment["connectionId"])
    connection = store.get_connection_config(connection_id)
    if not connection.get("enabled", True):
        raise ModelManagementError("connection_disabled")
    model_id = str(assignment["modelId"])
    model = model_by_id(model_id)
    if model is None:
        raise ModelManagementError("model_not_found")
    if model["modality"] != "chat":
        raise ModelManagementError("incompatible_model_slot")
    if model["providerId"] != connection["providerId"]:
        raise ModelManagementError("model_provider_mismatch")
    discovered = connection_models_response(connection_id, str(connection["providerId"]))
    descriptor = next(
        (item for item in discovered["models"] if item["id"] == model_id),
        None,
    )
    if descriptor is None or not descriptor.get("assignable", False):
        raise ModelManagementError("model_not_found")
    return {
        "connectionId": connection_id,
        "providerId": str(connection["providerId"]),
        "model": descriptor,
    }


def complete_sdk_text(payload: dict[str, Any]) -> dict[str, Any]:
    resolved = assigned_text_model()
    provider_id = resolved["providerId"]
    model = resolved["model"]
    group = model.get("integrationGroup") or {}
    if group.get("kind") != "sdk":
        raise ModelManagementError("text_provider_unsupported")
    adapter = _SDK_ADAPTERS.get(provider_id)
    if adapter is None:
        raise ModelManagementError("text_provider_unsupported")
    store = get_connection_store()
    connection = store.get_connection_config(resolved["connectionId"])
    credential = store.credential_store.get(resolved["connectionId"])
    if not credential:
        raise ModelManagementError("credential_missing")
    return adapter.complete(
        payload,
        api_base=str(connection["apiBase"]),
        credential=credential,
        model_id=str(model["id"]),
    )


def resolve_pi_native_proxy(connection_id: str) -> dict[str, str]:
    resolved = assigned_text_model()
    if resolved["connectionId"] != connection_id:
        raise ModelManagementError("model_provider_mismatch")
    group = resolved["model"].get("integrationGroup") or {}
    if group.get("kind") != "pi-native":
        raise ModelManagementError("text_provider_unsupported")
    provider = provider_definition(resolved["providerId"])
    if provider is None:
        raise ModelManagementError("text_provider_unsupported")
    store = get_connection_store()
    connection = store.get_connection_config(connection_id)
    credential = store.credential_store.get(connection_id)
    if not credential:
        raise ModelManagementError("credential_missing")
    return {
        "providerId": provider.id,
        "apiBase": str(connection["apiBase"]),
        "credential": credential,
        "modelId": str(resolved["model"]["id"]),
    }
