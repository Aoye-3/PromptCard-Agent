from __future__ import annotations

from typing import ClassVar

import pytest
from keyring.errors import KeyringError

from app.gateway.model_management.credential_store import (
    KEYRING_SERVICE_NAME,
    CredentialStore,
    CredentialStoreError,
    SystemKeyringCredentialStore,
)


class MemoryKeyringBackend:
    priority: ClassVar[int] = 1

    def __init__(self) -> None:
        self.passwords: dict[tuple[str, str], str] = {}
        self.calls: list[tuple[str, str, str] | tuple[str, str, str, str]] = []

    def set_password(self, service: str, username: str, password: str) -> None:
        self.calls.append(("set", service, username, password))
        self.passwords[(service, username)] = password

    def get_password(self, service: str, username: str) -> str | None:
        self.calls.append(("get", service, username))
        return self.passwords.get((service, username))

    def delete_password(self, service: str, username: str) -> None:
        self.calls.append(("delete", service, username))
        self.passwords.pop((service, username), None)


class UnavailableKeyringBackend(MemoryKeyringBackend):
    def __init__(self, secret: str) -> None:
        super().__init__()
        self.secret = secret

    def set_password(self, service: str, username: str, password: str) -> None:
        raise KeyringError(f"backend rejected {password}")

    def get_password(self, service: str, username: str) -> str | None:
        raise KeyringError(f"backend rejected {self.secret}")

    def delete_password(self, service: str, username: str) -> None:
        raise KeyringError(f"backend rejected {self.secret}")


def test_store_uses_stable_keyring_names_for_set_get_and_delete() -> None:
    backend = MemoryKeyringBackend()
    store: CredentialStore = SystemKeyringCredentialStore(backend=backend)

    store.set("connection-42", "test-secret")
    assert store.get("connection-42") == "test-secret"
    store.delete("connection-42")

    assert backend.calls == [
        ("set", KEYRING_SERVICE_NAME, "connection-42", "test-secret"),
        ("get", KEYRING_SERVICE_NAME, "connection-42"),
        ("delete", KEYRING_SERVICE_NAME, "connection-42"),
    ]
    assert store.get("connection-42") is None


def test_store_rejects_empty_secret_before_calling_keyring() -> None:
    backend = MemoryKeyringBackend()
    store = SystemKeyringCredentialStore(backend=backend)

    with pytest.raises(ValueError, match="secret_must_not_be_empty"):
        store.set("connection-42", "")

    assert backend.calls == []


@pytest.mark.parametrize("operation", ["set", "get", "delete"])
def test_store_normalizes_keyring_failures_without_revealing_secret(operation: str) -> None:
    secret = "do-not-leak-this-secret"
    store = SystemKeyringCredentialStore(backend=UnavailableKeyringBackend(secret))

    with pytest.raises(CredentialStoreError) as raised:
        if operation == "set":
            store.set("connection-42", secret)
        elif operation == "get":
            store.get("connection-42")
        else:
            store.delete("connection-42")

    error = raised.value
    assert error.code == "credential_store_unavailable"
    assert str(error) == "credential_store_unavailable"
    assert secret not in repr(error)
    assert secret not in str(error)
