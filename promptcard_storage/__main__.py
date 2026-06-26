from __future__ import annotations

import os

import uvicorn

from .app import app


if __name__ == "__main__":
    host = os.environ.get("PROMPTCARD_STORAGE_HOST", "127.0.0.1")
    port = int(os.environ.get("PROMPTCARD_STORAGE_PORT", "8002"))
    uvicorn.run(app, host=host, port=port)
