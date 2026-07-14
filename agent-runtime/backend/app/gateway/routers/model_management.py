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
from app.gateway.model_management.migration import migrate_legacy_model_config
from app.gateway.model_management.service import ConnectionProbeError, probe_connection

router = APIRouter(prefix="/api/promptcard/runtime", tags=["model-management"])


@router.get("/model-catalog")
async def model_catalog() -> dict[str, Any]:
    return catalog_response()


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
        credential = store.credential_store.get(connection_id)
        if not credential:
            raise ModelManagementError("credential_not_configured")
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


@router.get("/model-assignments")
async def model_assignments() -> dict[str, Any]:
    try:
        return {"assignments": _store().list_assignments()}
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


@router.put("/model-assignments/{slot}")
async def update_model_assignment(slot: str, body: AssignmentRequest) -> dict[str, Any]:
    try:
        return _store().set_assignment(slot, body)
    except (ModelManagementError, CredentialStoreError, OSError) as exc:
        raise _http_error(exc) from None


def _store():
    store = get_connection_store()
    migrate_legacy_model_config(
        store.path.parent / "promptcard-model-config.json",
        store,
    )
    return store


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
    return HTTPException(status_code=status_code, detail=code)
