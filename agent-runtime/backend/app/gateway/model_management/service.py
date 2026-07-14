from __future__ import annotations

import urllib.error
import urllib.request


class ConnectionProbeError(OSError):
    pass


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe_connection(api_base: str, credential: str) -> None:
    request = urllib.request.Request(
        f"{api_base}/models",
        headers={"Authorization": f"Bearer {credential}"},
    )
    opener = urllib.request.build_opener(_NoRedirectHandler())
    try:
        with opener.open(request, timeout=8) as response:
            if not 200 <= response.status < 300:
                raise ConnectionProbeError()
    except (OSError, urllib.error.HTTPError):
        raise ConnectionProbeError() from None
