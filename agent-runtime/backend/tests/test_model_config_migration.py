from __future__ import annotations

import json

import pytest

from app.gateway.model_management.connection_store import ModelConnectionStore
from app.gateway.model_management.credential_store import CredentialStoreError
from app.gateway.model_management.migration import migrate_legacy_model_config


class RecordingCredentialStore:
    def __init__(self, *, fail_on: str | None = None, read_back: str | None = None) -> None:
        self.events: list[tuple[str, str]] = []
        self.values: dict[str, str] = {}
        self.fail_on = fail_on
        self.read_back = read_back

    def set(self, connection_id: str, secret: str) -> None:
        self.events.append(("set", connection_id))
        if self.fail_on == "set":
            raise CredentialStoreError()
        self.values[connection_id] = secret

    def get(self, connection_id: str) -> str | None:
        self.events.append(("get", connection_id))
        if self.fail_on == "get":
            raise CredentialStoreError()
        return self.read_back if self.read_back is not None else self.values.get(connection_id)

    def delete(self, connection_id: str) -> None:
        self.events.append(("delete", connection_id))
        self.values.pop(connection_id, None)


def test_legacy_config_migrates_secret_before_atomic_connection_and_assignment_write(tmp_path):
    legacy_path = tmp_path / "promptcard-model-config.json"
    secret = "sk-legacy-plaintext"
    legacy_path.write_text(
        json.dumps(
            {
                "enabled": True,
                "apiBase": "https://api.deepseek.com",
                "apiKey": secret,
                "modelName": "deepseek-chat",
                "temperature": 0.2,
                "maxTokens": 3000,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    credentials = RecordingCredentialStore()
    store = ModelConnectionStore(tmp_path / "model-connections.json", credentials)

    migrated = migrate_legacy_model_config(legacy_path, store)

    assert migrated is True
    state = json.loads(store.path.read_text(encoding="utf-8"))
    connection = state["connections"][0]
    assert credentials.events[:2] == [("set", connection["id"]), ("get", connection["id"])]
    assert credentials.values[connection["id"]] == secret
    assert state["assignments"] == {
        "chat.primary": {
            "slot": "chat.primary",
            "connectionId": connection["id"],
            "modelId": "deepseek-chat",
        }
    }
    assert secret not in store.path.read_text(encoding="utf-8")
    sanitized_legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    assert "apiKey" not in sanitized_legacy


@pytest.mark.parametrize("fail_on", ["set", "get"])
def test_keyring_failure_keeps_legacy_file_byte_for_byte_unchanged(tmp_path, fail_on):
    legacy_path = tmp_path / "promptcard-model-config.json"
    original = b'{\r\n  "apiKey": "sk-still-plaintext",\r\n  "modelName": "deepseek-chat"\r\n}\r\n'
    legacy_path.write_bytes(original)
    credentials = RecordingCredentialStore(fail_on=fail_on)
    store = ModelConnectionStore(tmp_path / "model-connections.json", credentials)

    with pytest.raises(CredentialStoreError):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == original
    assert not store.path.exists()


def test_keyring_read_back_mismatch_keeps_legacy_file_unchanged(tmp_path):
    legacy_path = tmp_path / "promptcard-model-config.json"
    original = b'{"apiKey":"sk-plaintext","modelName":"deepseek-chat"}'
    legacy_path.write_bytes(original)
    credentials = RecordingCredentialStore(read_back="different")
    store = ModelConnectionStore(tmp_path / "model-connections.json", credentials)

    with pytest.raises(CredentialStoreError):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == original
    assert not store.path.exists()
    assert [event[0] for event in credentials.events] == ["set", "get", "delete"]
