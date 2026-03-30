from __future__ import annotations

from typing import Any, Dict, List

from pydantic import BaseModel


class AskRequest(BaseModel):
    question: str


class ColumnMeta(BaseModel):
    name: str
    type: str


class TableMeta(BaseModel):
    name: str
    row_count: int
    columns: List[ColumnMeta]


class TableData(BaseModel):
    table: str
    columns: List[ColumnMeta]
    rows: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int


class ChatMessage(BaseModel):
    question: str
    summary: str
    sql: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    timestamp: str
    duration_ms: int
