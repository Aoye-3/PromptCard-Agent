from __future__ import annotations

from typing import Any, Protocol


class TextProviderAdapter(Protocol):
    provider_id: str

    def complete(
        self,
        payload: dict[str, Any],
        *,
        api_base: str,
        credential: str,
        model_id: str,
    ) -> dict[str, Any]: ...
