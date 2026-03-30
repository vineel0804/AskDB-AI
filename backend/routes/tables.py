from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime
from typing import List

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from database import get_engine
from models import ColumnMeta, TableData, TableMeta

router = APIRouter(prefix="/api/db")


def _safe(value):
    if value is None:
        return None
    if isinstance(value, memoryview):
        return "[binary]"
    if isinstance(value, bytes):
        return "[binary]"
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


@router.get("/tables", response_model=List[TableMeta])
async def list_tables():
    """
    Two queries total instead of N+1:
    - pg_class for fast approximate row counts
    - information_schema.columns for all column metadata
    """
    engine = get_engine()
    with engine.connect() as conn:
        # Fast row counts from pg statistics (one query)
        counts: dict[str, int] = dict(
            conn.execute(text("""
                SELECT c.relname, GREATEST(c.reltuples::bigint, 0)
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
            """)).fetchall()
        )

        # All column metadata in one query
        cols_rows = conn.execute(text("""
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """)).fetchall()

    cols_by_table: dict[str, list[ColumnMeta]] = {}
    for table_name, col_name, data_type in cols_rows:
        cols_by_table.setdefault(table_name, []).append(
            ColumnMeta(name=col_name, type=data_type)
        )

    return [
        TableMeta(
            name=name,
            row_count=counts.get(name, 0),
            columns=cols,
        )
        for name, cols in sorted(cols_by_table.items())
    ]


@router.get("/tables/{table_name}", response_model=TableData)
async def get_table_data(
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    engine = get_engine()
    with engine.connect() as conn:
        # Check table exists
        exists = conn.execute(text("""
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = :name
        """), {"name": table_name}).scalar()
        if not exists:
            raise HTTPException(404, f"Table '{table_name}' not found")

        offset = (page - 1) * page_size
        total = int(conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar() or 0)

        result = conn.execute(
            text(f'SELECT * FROM "{table_name}" LIMIT :lim OFFSET :off'),
            {"lim": page_size, "off": offset},
        )
        col_names = list(result.keys())
        rows = [{k: _safe(v) for k, v in zip(col_names, row)} for row in result.fetchall()]

        # Column metadata
        cols_rows = conn.execute(text("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :name
            ORDER BY ordinal_position
        """), {"name": table_name}).fetchall()

    columns = [ColumnMeta(name=c[0], type=c[1]) for c in cols_rows]

    return TableData(
        table=table_name,
        columns=columns,
        rows=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, -(-total // page_size)),
    )
