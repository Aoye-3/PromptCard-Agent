from __future__ import annotations

import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit

from app.gateway.model_management.provider_registry import provider_definition


class ConnectionProbeError(OSError):
    pass


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe_connection(provider_id: str, api_base: str, credential: str) -> None:
    provider = provider_definition(provider_id)
    if provider is None:
        raise ConnectionProbeError()
    request = urllib.request.Request(
        _probe_url(api_base, provider.probe_path),
        headers={"Authorization": f"Bearer {credential}"},
    )
    opener = urllib.request.build_opener(_NoRedirectHandler())
    try:
        with opener.open(request, timeout=8) as response:
            if not 200 <= response.status < 300:
                raise ConnectionProbeError()
    except (OSError, urllib.error.HTTPError):
        raise ConnectionProbeError() from None


def _probe_url(api_base: str, probe_path: str) -> str:
    if probe_path.startswith("/"):
        parsed = urlsplit(api_base)
        return urlunsplit((parsed.scheme, parsed.netloc, probe_path, "", ""))
    return f"{api_base.rstrip('/')}/{probe_path.lstrip('/')}"
