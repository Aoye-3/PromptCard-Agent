"""Shared-token authentication for the local pi runtime and Python gateway."""

from __future__ import annotations

import os
import secrets

INTERNAL_AUTH_HEADER_NAME = "X-PromptCard-Internal-Token"


def internal_auth_token() -> str:
    return os.getenv("PROMPTCARD_INTERNAL_TOKEN", "").strip()


def create_internal_auth_headers() -> dict[str, str]:
    token = internal_auth_token()
    return {INTERNAL_AUTH_HEADER_NAME: token} if token else {}


def is_valid_internal_auth_token(token: str | None) -> bool:
    expected = internal_auth_token()
    return bool(expected and token) and secrets.compare_digest(token, expected)
