from __future__ import annotations

from typing import Any

from app.gateway.ark_chat import complete_ark_chat


class VolcengineArkTextAdapter:
    provider_id = "volcengine-ark"

    def complete(
        self,
        payload: dict[str, Any],
        *,
        api_base: str,
        credential: str,
        model_id: str,
    ) -> dict[str, Any]:
        return complete_ark_chat(
            payload,
            api_base=api_base,
            credential=credential,
            model_id=model_id,
        )
