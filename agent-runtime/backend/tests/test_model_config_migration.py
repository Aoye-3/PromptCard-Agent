from __future__ import annotations

import json
from uuid import NAMESPACE_URL, uuid5

import pytest

from app.gateway.model_management import migration
from app.gateway.model_management.connection_store import ModelConnectionStore, ModelManagementError
from app.gateway.model_management.contracts import ConnectionRequest
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
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)

    migrated = migrate_legacy_model_config(legacy_path, store)

    assert migrated is True
    state = json.loads(store.path.read_text(encoding="utf-8"))
    connection = state["connections"][0]
    assert credentials.events[:3] == [
        ("get", connection["id"]),
        ("set", connection["id"]),
        ("get", connection["id"]),
    ]
    assert credentials.events[3] == ("get", connection["id"])
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
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)

    with pytest.raises(CredentialStoreError):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == original
    assert not store.path.exists()


def test_keyring_read_back_mismatch_keeps_legacy_file_unchanged(tmp_path):
    legacy_path = tmp_path / "promptcard-model-config.json"
    original = b'{"apiKey":"sk-plaintext","modelName":"deepseek-chat"}'
    legacy_path.write_bytes(original)
    credentials = RecordingCredentialStore(read_back="different")
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)

    with pytest.raises(CredentialStoreError):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == original
    assert not store.path.exists()
    assert [event[0] for event in credentials.events] == ["get", "set", "get", "set"]


def test_state_write_failure_restores_original_state_legacy_and_keyring(tmp_path, monkeypatch):
    legacy_path = tmp_path / "promptcard-model-config.json"
    legacy_bytes = b'{"apiKey":"sk-new","modelName":"deepseek-chat"}\r\n'
    legacy_path.write_bytes(legacy_bytes)
    state_bytes = b'{"version":1,"connections":[],"assignments":{}}\r\n'
    state_path = tmp_path / "promptcard-model-connections.json"
    state_path.write_bytes(state_bytes)
    credentials = RecordingCredentialStore()
    store = ModelConnectionStore(state_path, credentials)
    connection_id = _legacy_connection_id(legacy_path)
    credentials.values[connection_id] = "sk-prior"

    def partial_state_write(state):
        state_path.write_bytes(b"partial-new-state")
        raise OSError("state write failed")

    monkeypatch.setattr(store, "replace_state", partial_state_write)

    with pytest.raises(ModelManagementError, match="migration_failed"):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == legacy_bytes
    assert state_path.read_bytes() == state_bytes
    assert credentials.values[connection_id] == "sk-prior"


def test_legacy_rewrite_failure_restores_original_state_legacy_and_keyring(tmp_path, monkeypatch):
    legacy_path = tmp_path / "promptcard-model-config.json"
    legacy_bytes = b'{"apiKey":"sk-new","modelName":"deepseek-chat"}\n'
    legacy_path.write_bytes(legacy_bytes)
    state_path = tmp_path / "promptcard-model-connections.json"
    state_bytes = b'{\n  "version": 1,\n  "connections": [],\n  "assignments": {}\n}\n'
    state_path.write_bytes(state_bytes)
    credentials = RecordingCredentialStore()
    store = ModelConnectionStore(state_path, credentials)
    connection_id = _legacy_connection_id(legacy_path)
    credentials.values[connection_id] = "sk-prior"
    real_atomic_write = migration._atomic_write_json

    def fail_legacy_rewrite(path, payload):
        if path == legacy_path:
            path.write_bytes(b"partially-sanitized")
            raise OSError("legacy rewrite failed")
        real_atomic_write(path, payload)

    monkeypatch.setattr(migration, "_atomic_write_json", fail_legacy_rewrite)

    with pytest.raises(ModelManagementError, match="migration_failed"):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == legacy_bytes
    assert state_path.read_bytes() == state_bytes
    assert credentials.values[connection_id] == "sk-prior"


@pytest.mark.parametrize("existing", [False, True], ids=["new", "existing"])
@pytest.mark.parametrize("failed_boundary", ["state", "legacy", "keyring"])
def test_migration_rollback_attempts_every_boundary_after_one_restore_fails(
    tmp_path,
    monkeypatch,
    existing,
    failed_boundary,
):
    legacy_path = tmp_path / "promptcard-model-config.json"
    legacy_bytes = b'{"apiKey":"sk-new","modelName":"deepseek-chat"}\n'
    legacy_path.write_bytes(legacy_bytes)
    credentials = RecordingCredentialStore()
    store = ModelConnectionStore(
        tmp_path / "promptcard-model-connections.json",
        credentials,
    )
    connection_id = _legacy_connection_id(legacy_path)
    if existing:
        state = store.read_state()
        state["connections"].append(
            store.prepare_connection(
                connection_id,
                ConnectionRequest(
                    providerId="deepseek",
                    displayName="Existing",
                    apiBase="https://api.deepseek.com",
                    enabled=True,
                ),
            )
        )
        store.replace_state(state)
        credentials.values[connection_id] = "sk-prior"
    original_state = store.state_bytes()
    events: list[str] = []
    real_restore_state = store.restore_state_bytes
    real_restore_legacy = migration._atomic_write_bytes
    real_restore_credential = store._restore_credential

    def restore_state(data):
        events.append("state")
        if failed_boundary == "state":
            raise OSError("raw state restore failure")
        real_restore_state(data)

    def restore_legacy(path, data):
        events.append("legacy")
        if failed_boundary == "legacy":
            raise OSError("raw legacy restore failure")
        real_restore_legacy(path, data)

    def restore_credential(restored_connection_id, secret):
        events.append("keyring")
        if failed_boundary == "keyring":
            raise CredentialStoreError()
        real_restore_credential(restored_connection_id, secret)

    monkeypatch.setattr(store, "restore_state_bytes", restore_state)
    monkeypatch.setattr(migration, "_atomic_write_bytes", restore_legacy)
    monkeypatch.setattr(store, "_restore_credential", restore_credential)
    monkeypatch.setattr(
        migration,
        "_atomic_write_json",
        lambda path, payload: (_ for _ in ()).throw(OSError("raw sanitize failure")),
    )

    with pytest.raises(ModelManagementError, match="^migration_rollback_failed$"):
        migrate_legacy_model_config(legacy_path, store)

    assert events == ["state", "legacy", "keyring"]
    if failed_boundary != "state":
        assert store.state_bytes() == original_state
    if failed_boundary != "legacy":
        assert legacy_path.read_bytes() == legacy_bytes
    if failed_boundary != "keyring":
        expected = "sk-prior" if existing else None
        assert credentials.values.get(connection_id) == expected


def test_migration_rejects_image_model_for_deepseek_without_mutation(tmp_path):
    legacy_path = tmp_path / "promptcard-model-config.json"
    original = b'{"apiKey":"sk-new","modelName":"doubao-seedream-5-0-pro-260628"}'
    legacy_path.write_bytes(original)
    credentials = RecordingCredentialStore()
    store = ModelConnectionStore(tmp_path / "promptcard-model-connections.json", credentials)

    with pytest.raises(ModelManagementError, match="incompatible_model_slot"):
        migrate_legacy_model_config(legacy_path, store)

    assert legacy_path.read_bytes() == original
    assert not store.path.exists()
    assert credentials.values == {}


def _legacy_connection_id(legacy_path):
    return str(uuid5(NAMESPACE_URL, f"promptcard:legacy:deepseek:{legacy_path.resolve()}"))
