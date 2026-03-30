from __future__ import annotations

import os
import re
from typing import Any

from sqlalchemy import create_engine, text

from query_agent.config_loader.config import load_config

_db_engine = None


def get_engine():
    global _db_engine
    if _db_engine is None:
        cfg = load_config("config.yaml")
        db_url = os.environ.get("DATABASE_URL") or cfg["postgres"]["url"]
        if not db_url:
            raise RuntimeError("Database URL not set. Add DATABASE_URL to .env or postgres.url to config.yaml")
        _db_engine = create_engine(db_url, pool_pre_ping=True)
    return _db_engine


def exec_sql(sql: str, limit: int = 200) -> tuple[list[str], list[dict]]:
    """Execute a read-only SQL statement and return (columns, rows)."""
    safe = sql.strip().rstrip(";")
    with get_engine().connect() as conn:
        result = conn.execute(text(f"SELECT * FROM ({safe}) __q LIMIT {limit}"))
        cols = list(result.keys())
        rows = [dict(zip(cols, row)) for row in result.fetchall()]
    return cols, rows


def extract_result(raw: Any) -> tuple[str, str]:
    """Pull the SQL and summary out of the agent's JSON response."""
    t = str(raw)
    sql_match = re.search(r'"sql"\s*:\s*"((?:[^"\\]|\\.)*)"', t)
    summary_match = re.search(r'"summary"\s*:\s*"((?:[^"\\]|\\.)*)"', t)
    if sql_match:
        sql = sql_match.group(1).replace("\\n", "\n").replace('\\"', '"')
        summary = summary_match.group(1).replace("\\n", "\n").replace('\\"', '"') if summary_match else ""
        return sql, summary
    # Fallback: extract bare SQL, no summary
    m = re.search(r'```(?:sql)?\s*\n?(.*?)\n?```', t, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip(), ""
    m = re.search(r'((?:SELECT|WITH)\b.+)', t, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip(), ""
    return t.strip(), ""
