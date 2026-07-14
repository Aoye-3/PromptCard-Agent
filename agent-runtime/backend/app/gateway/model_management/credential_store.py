from __future__ import annotations

from typing import Protocol

import keyring
from keyring.errors import KeyringError

KEYRING_SERVICE_NAME = "dev.promptcard.manager.shell"


def _keyring_username(connection_id: str) -> str:
    return f"connection:{connection_id}"


class CredentialStore(Protocol):
    def set(self, connection_id: str, secret: str) -> None: ...

    def get(self, connection_id: str) -> str | None: ...

    def delete(self, connection_id: str) -> None: ...


class KeyringBackend(Protocol):
    def set_password(self, service: str, username: str, password: str) -> None: ...

    def get_password(self, service: str, username: str) -> str | None: ...

    def delete_password(self, service: str, username: str) -> None: ...


class CredentialStoreError(RuntimeError):
    code = "credential_store_unavailable"

    def __init__(self) -> None:
        super().__init__(self.code)


class SystemKeyringCredentialStore:
    def __init__(self, backend: KeyringBackend | None = None) -> None:
        self._backend = backend if backend is not None else keyring.get_keyring()

    def set(self, connection_id: str, secret: str) -> None:
        if not secret:
            raise ValueError("secret_must_not_be_empty")
        try:
            self._backend.set_password(KEYRING_SERVICE_NAME, _keyring_username(connection_id), secret)
        except KeyringError:
            raise CredentialStoreError() from None

    def get(self, connection_id: str) -> str | None:
        try:
            return self._backend.get_password(KEYRING_SERVICE_NAME, _keyring_username(connection_id))
        except KeyringError:
            raise CredentialStoreError() from None

    def delete(self, connection_id: str) -> None:
        try:
            self._backend.delete_password(KEYRING_SERVICE_NAME, _keyring_username(connection_id))
        except KeyringError:
            raise CredentialStoreError() from None
