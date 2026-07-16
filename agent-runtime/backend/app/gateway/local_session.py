from __future__ import annotations

import secrets

LOCAL_SESSION_COOKIE = "access_token"
_LOCAL_SESSION_TOKEN = secrets.token_urlsafe(48)


def local_session_token() -> str:
    return _LOCAL_SESSION_TOKEN


def is_valid_local_session(token: str | None) -> bool:
    return bool(token) and secrets.compare_digest(token, _LOCAL_SESSION_TOKEN)
