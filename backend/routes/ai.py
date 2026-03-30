"""
AI suggestions endpoint.

GET /api/ai/suggestions/{table_name}
  → Returns 4 Claude-generated questions for the given table's schema.
  → Results are cached in-memory (one Claude call per table per server lifetime).
"""
from __future__ import annotations

import json
import os
import re

import anthropic
from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from database import get_engine

router = APIRouter(prefix="/api/ai")

# ── Lazy singleton Anthropic client ───────────────────────────────────────────
_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


# ── In-memory suggestion cache (table_name → list[str]) ───────────────────────
_cache: dict[str, list[str]] = {}


# ── Schema helper ─────────────────────────────────────────────────────────────
def _fetch_schema(table_name: str) -> list[dict[str, str]]:
    """Return column metadata for *table_name* from information_schema."""
    engine = get_engine()
    with engine.connect() as conn:
        exists = conn.execute(
            text("""
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :name
            """),
            {"name": table_name},
        ).scalar()
        if not exists:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        rows = conn.execute(
            text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = :name
                ORDER BY ordinal_position
            """),
            {"name": table_name},
        ).fetchall()

    return [{"name": r[0], "type": r[1]} for r in rows]


# ── Suggestion parser with fallback ───────────────────────────────────────────
def _parse_suggestions(raw: str) -> list[str]:
    """Parse Claude's response into a list[str], with a JSON-array fallback."""
    try:
        result = json.loads(raw)
        if isinstance(result, list):
            return [str(s) for s in result[:4]]
    except json.JSONDecodeError:
        pass

    # Fallback: find first [...] block in the text
    match = re.search(r"\[.*?\]", raw, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return [str(s) for s in result[:4]]
        except json.JSONDecodeError:
            pass

    raise ValueError("Could not parse suggestions from AI response")


# ── Route ─────────────────────────────────────────────────────────────────────
@router.get("/suggestions/{table_name}")
async def get_suggestions(table_name: str) -> dict:
    """
    Return 4 AI-generated business questions for *table_name*.
    Results are cached — Claude is only called once per table per server run.
    """
    if table_name in _cache:
        return {"suggestions": _cache[table_name], "cached": True}

    schema = _fetch_schema(table_name)
    columns_desc = ", ".join(f"{c['name']} ({c['type']})" for c in schema)

    prompt = (
        f"You are a data analyst. Given the PostgreSQL table '{table_name}' "
        f"with these columns: {columns_desc}\n\n"
        "Generate exactly 4 concise, specific, business-relevant questions "
        "that a data analyst would ask about this table. "
        "Each question must be answerable with a single SQL query. "
        "Keep questions short (under 10 words each).\n\n"
        "Return ONLY a valid JSON array of 4 strings. "
        "No markdown, no explanation, no extra text."
    )

    try:
        message = _get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        suggestions = _parse_suggestions(raw)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except anthropic.APIError as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}")

    _cache[table_name] = suggestions
    return {"suggestions": suggestions, "cached": False}
