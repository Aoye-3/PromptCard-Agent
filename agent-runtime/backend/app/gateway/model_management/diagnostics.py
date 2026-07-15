from __future__ import annotations

import importlib.metadata
import importlib.util
import os
import time

import keyring

IMAGE_GENERATION_FEATURE_ENV = "PROMPTCARD_IMAGE_GENERATION_NODE_V1"
ARK_DISTRIBUTION = "volcengine-python-sdk"
ARK_REQUIRED_VERSION = "5.0.36"
ARK_RUNTIME_MODULE = "volcenginesdkarkruntime"
ARK_SDK_ERROR_MESSAGES = {
    "ark_sdk_missing": "The Ark SDK is not installed or cannot be imported.",
    "ark_sdk_incompatible": "The installed Ark SDK version is incompatible.",
    "ark_sdk_check_failed": "The Ark SDK status could not be checked.",
}


def collect_image_generation_status() -> dict[str, object]:
    sdk = _sdk_status()
    return {
        "serverEnabled": _feature_enabled(),
        "checkedAt": _now_ms(),
        "credentialStore": {"available": _keyring_available()},
        "providers": [
            {
                "providerId": "volcengine-ark",
                "status": sdk["status"],
                "sdk": {
                    key: value
                    for key, value in sdk.items()
                    if key != "status"
                },
            }
        ],
    }


def _sdk_status() -> dict[str, object]:
    try:
        version = _distribution_version(ARK_DISTRIBUTION)
    except Exception:
        return _sdk_response(None, "check_failed", "ark_sdk_check_failed")
    if version is None:
        return _sdk_response(None, "missing", "ark_sdk_missing")
    if version != ARK_REQUIRED_VERSION:
        return _sdk_response(version, "incompatible", "ark_sdk_incompatible")
    try:
        import_available = _ark_import_available()
    except Exception:
        return _sdk_response(version, "check_failed", "ark_sdk_check_failed")
    if not import_available:
        return _sdk_response(version, "missing", "ark_sdk_missing")
    return _sdk_response(version, "ready", None)


def _sdk_response(
    version: str | None,
    status: str,
    error_code: str | None,
) -> dict[str, object]:
    return {
        "packageName": ARK_DISTRIBUTION,
        "installedVersion": version,
        "requiredVersion": ARK_REQUIRED_VERSION,
        "compatible": status == "ready",
        "error": (
            None
            if error_code is None
            else {
                "code": error_code,
                "message": ARK_SDK_ERROR_MESSAGES[error_code],
            }
        ),
        "status": status,
    }


def _feature_enabled() -> bool:
    return os.getenv(IMAGE_GENERATION_FEATURE_ENV, "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _keyring_available() -> bool:
    try:
        backend = keyring.get_keyring()
        return float(backend.priority) > 0
    except Exception:
        return False


def _distribution_version(package: str) -> str | None:
    try:
        return importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        return None


def _ark_import_available() -> bool:
    return importlib.util.find_spec(ARK_RUNTIME_MODULE) is not None


def _now_ms() -> int:
    return time.time_ns() // 1_000_000
