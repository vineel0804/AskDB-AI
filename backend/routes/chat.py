from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from llama_index.core.workflow import Context

from database import exec_sql, extract_result
from models import AskRequest, ChatMessage
from query_agent.engine.agent import build_query_engine, format_user_prompt

router = APIRouter(prefix="/api/chat")

_chat_history: List[Dict[str, Any]] = []


def _serialize(value: Any) -> Any:
    """Make any DB value JSON-safe."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime,)):
        return value.isoformat()
    return str(value) if not isinstance(value, (str, int, float, bool)) else value


def _sse(data: Dict[str, Any]) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/stream")
async def chat_stream(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(400, "Question cannot be empty")

    async def event_stream():
        t0 = datetime.now()
        sql = ""
        summary = ""
        cols: list = []
        rows: list = []

        try:
            # ── 1. Thinking ──────────────────────────────────────────────────
            yield _sse({"type": "status", "text": "Analyzing schema…"})

            agent = build_query_engine(user_question=req.question)
            ctx = Context(agent)

            yield _sse({"type": "status", "text": "Generating SQL…"})
            raw = await agent.run(format_user_prompt(req.question), ctx=ctx)
            sql, summary = extract_result(raw)

            # ── 2. SQL ready ─────────────────────────────────────────────────
            yield _sse({"type": "sql", "sql": sql})

            # ── 3. Execute & send rows ───────────────────────────────────────
            yield _sse({"type": "status", "text": "Running query…"})
            cols, rows = exec_sql(sql)
            safe_rows = [{k: _serialize(v) for k, v in row.items()} for row in rows]
            yield _sse({"type": "rows", "columns": cols, "rows": safe_rows, "row_count": len(rows)})

            # ── 4. Stream summary word by word ───────────────────────────────
            if not summary:
                summary = "No results were found for that query." if not rows else "Query executed successfully."

            for word in summary.split():
                yield _sse({"type": "token", "text": word + " "})
                await asyncio.sleep(0.03)

            # ── 5. Done ──────────────────────────────────────────────────────
            duration_ms = int((datetime.now() - t0).total_seconds() * 1000)
            yield _sse({"type": "done", "duration_ms": duration_ms})

            # ── Persist to history ───────────────────────────────────────────
            entry: Dict[str, Any] = {
                "question": req.question,
                "summary": summary,
                "sql": sql,
                "columns": cols,
                "rows": rows,
                "row_count": len(rows),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_ms": duration_ms,
            }
            _chat_history.insert(0, entry)
            del _chat_history[50:]

        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("", response_model=ChatMessage)
async def chat(req: AskRequest):
    if not req.question.strip():
        raise HTTPException(400, "Question cannot be empty")
    t0 = datetime.now()
    try:
        agent = build_query_engine(user_question=req.question)
        ctx = Context(agent)
        raw = await agent.run(format_user_prompt(req.question), ctx=ctx)
        sql, summary = extract_result(raw)
        cols, rows = exec_sql(sql)
        if not summary:
            summary = "No results were found for that query." if not rows else ""
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc

    entry: Dict[str, Any] = {
        "question": req.question,
        "summary": summary,
        "sql": sql,
        "columns": cols,
        "rows": rows,
        "row_count": len(rows),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_ms": int((datetime.now() - t0).total_seconds() * 1000),
    }
    _chat_history.insert(0, entry)
    del _chat_history[50:]
    return entry


@router.get("/history", response_model=List[ChatMessage])
async def chat_history():
    return _chat_history
