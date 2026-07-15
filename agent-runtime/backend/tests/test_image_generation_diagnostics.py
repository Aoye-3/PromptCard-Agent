from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.gateway.model_management import diagnostics
from app.gateway.routers import model_management

SHARED_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "image-generation-status.json"
)


def test_image_generation_status_matches_approved_cross_layer_fixture(monkeypatch):
    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
    monkeypatch.setattr(diagnostics, "_keyring_available", lambda: True)
    monkeypatch.setattr(diagnostics, "_distribution_version", lambda package: "5.0.36")
    monkeypatch.setattr(diagnostics, "_ark_import_available", lambda: True)
    monkeypatch.setattr(diagnostics, "_now_ms", lambda: 1_752_572_345_678)

    status = diagnostics.collect_image_generation_status()

    assert status == json.loads(SHARED_FIXTURE.read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    ("installed_version", "import_result", "expected_status", "expected_code"),
    [
        (None, True, "missing", "ark_sdk_missing"),
        ("5.0.35", True, "incompatible", "ark_sdk_incompatible"),
        ("5.0.36", False, "missing", "ark_sdk_missing"),
    ],
)
def test_provider_status_always_matches_sdk_status(
    monkeypatch,
    installed_version,
    import_result,
    expected_status,
    expected_code,
):
    monkeypatch.setattr(diagnostics, "_keyring_available", lambda: True)
    monkeypatch.setattr(
        diagnostics,
        "_distribution_version",
        lambda package: installed_version,
    )
    monkeypatch.setattr(
        diagnostics,
        "_ark_import_available",
        lambda: import_result,
    )

    [provider] = diagnostics.collect_image_generation_status()["providers"]

    assert provider["status"] == expected_status
    assert provider["sdk"]["error"] == {
        "code": expected_code,
        "message": diagnostics.ARK_SDK_ERROR_MESSAGES[expected_code],
    }


def test_distribution_check_failure_is_sanitized(monkeypatch):
    monkeypatch.setattr(diagnostics, "_keyring_available", lambda: True)
    monkeypatch.setattr(
        diagnostics,
        "_distribution_version",
        lambda package: (_ for _ in ()).throw(RuntimeError("C:/private/sdk")),
    )

    status = diagnostics.collect_image_generation_status()
    [provider] = status["providers"]

    assert provider["status"] == "check_failed"
    assert provider["sdk"]["installedVersion"] is None
    assert provider["sdk"]["error"]["code"] == "ark_sdk_check_failed"
    assert "private" not in json.dumps(status)


def test_keyring_exception_reports_only_availability(monkeypatch):
    monkeypatch.setattr(
        diagnostics.keyring,
        "get_keyring",
        lambda: (_ for _ in ()).throw(RuntimeError("C:/private/keyring")),
    )
    monkeypatch.setattr(diagnostics, "_distribution_version", lambda package: "5.0.36")
    monkeypatch.setattr(diagnostics, "_ark_import_available", lambda: True)

    status = diagnostics.collect_image_generation_status()

    assert status["credentialStore"] == {"available": False}
    assert "private" not in json.dumps(status)


def test_image_generation_status_endpoint_rechecks_on_every_get(monkeypatch):
    calls = 0

    def collect():
        nonlocal calls
        calls += 1
        return {
            "serverEnabled": True,
            "checkedAt": calls,
            "credentialStore": {"available": True},
            "providers": [],
        }

    monkeypatch.setattr(model_management, "collect_image_generation_status", collect)
    app = FastAPI()
    app.include_router(model_management.router)

    with TestClient(app) as client:
        first = client.get("/api/promptcard/runtime/image-generation-status")
        second = client.get("/api/promptcard/runtime/image-generation-status")

    assert first.status_code == 200
    assert first.json()["checkedAt"] == 1
    assert second.json()["checkedAt"] == 2
    assert calls == 2
