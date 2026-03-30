#!/usr/bin/env python3
"""
FastAPI backend for SQL Agent UI.

Start:
    cd backend
    uvicorn api:app --reload --port 8000
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# ── Path bootstrap ─────────────────────────────────────────────────────────────
# Must run from this directory so relative paths (config.yaml, storage/) resolve.
BASE_DIR = Path(__file__).parent.resolve()
os.chdir(BASE_DIR)
load_dotenv(BASE_DIR / ".env")
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# ── App setup ─────────────────────────────────────────────────────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.ai import router as ai_router
from routes.chat import router as chat_router
from routes.tables import router as tables_router

app = FastAPI(title="SQL Agent API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)
app.include_router(chat_router)
app.include_router(tables_router)


@app.on_event("startup")
async def _startup():
    """Pre-warm the agent in the background so the first chat request is fast."""
    import asyncio

    async def _warm():
        try:
            from query_agent.engine.agent import build_query_engine
            build_query_engine()
            print("[startup] Agent ready.")
        except Exception as exc:
            print(f"[startup] Agent pre-warm failed: {exc}")

    asyncio.create_task(_warm())


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=False)
