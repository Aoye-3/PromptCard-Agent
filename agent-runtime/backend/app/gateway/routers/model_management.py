from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.gateway.model_management.catalog import catalog_response
from app.gateway.model_management.connection_store import (
    ModelManagementError,
    get_connection_store,
    validate_provider_endpoint,
)
from app.gateway.model_management.contracts import AssignmentRequest, ConnectionRequest
from app.gateway.model_management.credential_store import CredentialStoreError
from app.gateway.model_management.diagnostics import collect_image_generation_status
from app.gateway.model_management.migration import migrate_legacy_model_config
from app.gateway.model_management.service import ConnectionProbeError, probe_connection

router = APIRouter(prefix="/api/promptcard/runtime", tags=["model-management"])


@router.get("/model-catalog")
async def model_catalog() -> dict[str, Any]:
    return catalog_response()


@router.get("/image-generation-status")
async def image_generation_status() -> dict[str, object]:
    return collect_image_generation_status()


@router.get("/model-connections")
async def model_connections() -> dict[str, Any]:
    try:
        return {"connections": _store().list_connections()}
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.post("/model-connections", status_code=status.HTTP_201_CREATED)
async def create_model_connection(body: ConnectionRequest) -> dict[str, Any]:
    try:
        return _store().create_connection(body)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.put("/model-connections/{connection_id}")
async def update_model_connection(
    connection_id: str,
    body: ConnectionRequest,
) -> dict[str, Any]:
    try:
        return _store().update_connection(connection_id, body)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.delete("/model-connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_connection(connection_id: str) -> Response:
    try:
        _store().delete_connection(connection_id)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/model-connections/{connection_id}/test")
async def test_model_connection(connection_id: str) -> dict[str, Any]:
    try:
        store = _store()
        connection = store.get_connection_config(connection_id)
        validate_provider_endpoint(
            str(connection["providerId"]),
            str(connection["apiBase"]),
        )
        _require_ark_sdk_ready(connection)
        credential = store.credential_store.get(connection_id)
        if not credential:
            raise ModelManagementError("credential_missing")
        probe_connection(str(connection["apiBase"]), credential)
    except ConnectionProbeError:
        success = False
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None
    else:
        success = True
    try:
        store.record_test(connection_id, success=success)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None
    return {
        "success": success,
        "message": "Connection ok." if success else "Connection failed.",
    }


@router.get("/model-connections/{connection_id}/dependencies")
async def model_connection_dependencies(connection_id: str) -> dict[str, Any]:
    try:
        return _store().connection_dependencies(connection_id)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.get("/model-assignments")
async def model_assignments() -> dict[str, Any]:
    try:
        return {"assignments": _store().list_assignments()}
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.put("/model-assignments/{slot}")
async def update_model_assignment(slot: str, body: AssignmentRequest) -> dict[str, Any]:
    try:
        store = _store()
        if slot == "image.primary":
            connection = store.get_connection_config(body.connection_id)
            _require_ark_sdk_ready(connection)
        return store.set_assignment(slot, body, require_ready=True)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.delete("/model-assignments/{slot}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_assignment(slot: str) -> Response:
    try:
        _store().delete_assignment(slot)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _store():
    store = get_connection_store()
    migrate_legacy_model_config(
        store.path.parent / "promptcard-model-config.json",
        store,
    )
    return store


def _require_ark_sdk_ready(connection: dict[str, Any]) -> None:
    if connection.get("providerId") != "volcengine-ark":
        return
    status = collect_image_generation_status()
    provider = next(
        (
            item
            for item in status.get("providers", [])
            if isinstance(item, dict) and item.get("providerId") == "volcengine-ark"
        ),
        None,
    )
    if provider is not None and provider.get("status") == "ready":
        return
    sdk = provider.get("sdk") if isinstance(provider, dict) else None
    error = sdk.get("error") if isinstance(sdk, dict) else None
    code = error.get("code") if isinstance(error, dict) else None
    if code not in {"ark_sdk_missing", "ark_sdk_incompatible", "ark_sdk_check_failed"}:
        code = "ark_sdk_check_failed"
    raise ModelManagementError(code)


def _http_error(exc: ModelManagementError | CredentialStoreError | OSError) -> HTTPException:
    code = getattr(exc, "code", "connection_store_unavailable")
    status_code = 409 if code == "connection_is_assigned" else 422
    if code in {
        "credential_store_unavailable",
        "connection_store_unavailable",
        "migration_failed",
        "migration_rollback_failed",
        "model_config_rollback_failed",
    }:
        status_code = 503
    return HTTPException(status_code=status_code, detail=_error_detail(code))


def _error_detail(code: str) -> dict[str, Any]:
    message, action, retryable, field = {
        "connection_not_found": (
            "The model connection was not found.",
            "refresh_connections",
            False,
            "connectionId",
        ),
        "connection_disabled": (
            "The model connection is disabled.",
            "enable_connection",
            False,
            "connectionId",
        ),
        "credential_missing": (
            "The model connection has no configured credential.",
            "update_credential",
            False,
            "connectionId",
        ),
        "connection_not_tested": (
            "The model connection must be tested before assignment.",
            "test_connection",
            False,
            "connectionId",
        ),
        "connection_test_failed": (
            "The latest model connection test failed.",
            "test_connection",
            True,
            "connectionId",
        ),
        "ark_sdk_missing": (
            "The Ark SDK is not installed or cannot be imported.",
            "recheck_sdk",
            False,
            None,
        ),
        "ark_sdk_incompatible": (
            "The installed Ark SDK version is incompatible.",
            "recheck_sdk",
            False,
            None,
        ),
        "ark_sdk_check_failed": (
            "The Ark SDK status could not be checked.",
            "recheck_sdk",
            True,
            None,
        ),
        "connection_is_assigned": (
            "The model connection is assigned to a default slot.",
            "clear_assignment",
            False,
            "connectionId",
        ),
        "assignment_not_found": (
            "The model assignment was not found.",
            "refresh_assignments",
            False,
            "slot",
        ),
        "invalid_model_slot": (
            "The model assignment slot is invalid.",
            "select_model_slot",
            False,
            "slot",
        ),
        "incompatible_model_slot": (
            "The selected model does not support this assignment slot.",
            "select_compatible_model",
            False,
            "modelId",
        ),
        "model_provider_mismatch": (
            "The selected model and connection use different providers.",
            "select_compatible_model",
            False,
            "modelId",
        ),
        "model_not_found": (
            "The selected model was not found.",
            "refresh_catalog",
            False,
            "modelId",
        ),
        "credential_store_unavailable": (
            "Secure credential storage is unavailable.",
            "check_credential_store",
            True,
            None,
        ),
        "connection_store_unavailable": (
            "Model connection storage is unavailable.",
            "retry",
            True,
            None,
        ),
    }.get(
        code,
        ("The model management request could not be completed.", "review_input", False, None),
    )
    detail: dict[str, Any] = {
        "code": code,
        "message": message,
        "action": action,
        "retryable": retryable,
    }
    if field is not None:
        detail["field"] = field
    return detail
