from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy import text as sa_text

from ..config_loader.config import get_llm_config, get_postgres_config
from ..prompts.prompts import SQL_REACT_SYSTEM_PROMPT, USER_PROMPT_TEMPLATE

from llama_index.core import Settings, SQLDatabase, VectorStoreIndex
from llama_index.core.agent import ReActAgent
from llama_index.core.callbacks import CallbackManager
from llama_index.core.objects import ObjectIndex, SQLTableNodeMapping, SQLTableSchema
from llama_index.core.tools import FunctionTool
from llama_index.embeddings.fastembed import FastEmbedEmbedding
from llama_index.llms.anthropic import Anthropic

PERSIST_DIR = str(Path(__file__).parent.parent.parent / "storage" / "sql_schema_index")

_callback_manager = CallbackManager([])
Settings.callback_manager = _callback_manager

# ── Singleton ──────────────────────────────────────────────────────────────────
_agent: Any = None
_sqlalchemy_engine: Any = None


def _build_agent() -> Any:
    global _sqlalchemy_engine

    postgres_config = get_postgres_config()
    database_url = postgres_config.get("url")
    if not database_url:
        raise RuntimeError("Missing required config: postgres.url")

    _sqlalchemy_engine = create_engine(database_url, pool_pre_ping=True)
    database = SQLDatabase(_sqlalchemy_engine)
    usable_table_names = list(database.get_usable_table_names())

    llm_config = get_llm_config()
    api_key = os.environ.get("ANTHROPIC_API_KEY") or llm_config.get("api_key") or ""
    model_name = llm_config.get("model", "claude-haiku-4-5-20251001")
    temperature = float(llm_config.get("temperature", 0.0))
    embedding_model_name = llm_config.get("embedding_model", "BAAI/bge-small-en-v1.5")

    llm = Anthropic(
        model=str(model_name),
        api_key=str(api_key),
        temperature=temperature,
        max_tokens=4096,
    )
    embed_model = FastEmbedEmbedding(model_name=str(embedding_model_name))

    Settings.llm = llm
    Settings.embed_model = embed_model

    persist_path = Path(PERSIST_DIR)
    table_node_mapping = SQLTableNodeMapping(database)
    has_persist = persist_path.exists() and any(persist_path.iterdir())
    print(f"[persist] dir={PERSIST_DIR} exists={persist_path.exists()} has_files={has_persist}")

    if has_persist:
        print(f"[persist] Loading schema index from: {PERSIST_DIR}")
        object_index = ObjectIndex.from_persist_dir(
            persist_dir=PERSIST_DIR,
            object_node_mapping=table_node_mapping,
        )
    else:
        print(f"[persist] Building schema index and saving to: {PERSIST_DIR}")
        table_schemas = [
            SQLTableSchema(
                table_name=name,
                context_str=f"Table {name} columns: {', '.join(c.name if hasattr(c, 'name') else str(c) for c in database.get_table_columns(name))}",
            )
            for name in usable_table_names
        ]
        object_index = ObjectIndex.from_objects(table_schemas, table_node_mapping, VectorStoreIndex)
        object_index.persist(persist_dir=PERSIST_DIR)
        print(f"[persist] Saved schema index to: {PERSIST_DIR}")

    # Pure vector search — no LLM call inside the tool
    retriever = object_index.index.as_retriever(similarity_top_k=5)

    def introspect_schema(question: str) -> str:
        """Return raw schema text for tables relevant to the question."""
        nodes = retriever.retrieve(question)
        return "\n\n".join(node.get_content() for node in nodes)

    def sql_query(sql: str) -> str:
        """Execute a SQL statement and return the results as a formatted table."""
        clean_sql = sql.strip().rstrip(";")
        try:
            with _sqlalchemy_engine.connect() as conn:
                result = conn.execute(sa_text(f"SELECT * FROM ({clean_sql}) __q LIMIT 15"))
                cols = list(result.keys())
                rows = [dict(zip(cols, row)) for row in result.fetchall()]
            preview = "\t".join(cols) + "\n"
            for row in rows:
                preview += "\t".join(str(v) for v in row.values()) + "\n"
            return f"Results ({len(rows)} rows):\n{preview}"
        except Exception as exc:
            return f"Execution error: {exc}"

    schema_tool = FunctionTool.from_defaults(
        fn=introspect_schema,
        name="introspect_schema",
        description="Get table and column schema information relevant to the question. Input must be natural language.",
    )

    sql_tool = FunctionTool.from_defaults(
        fn=sql_query,
        name="sql_query",
        description="Execute a SQL SELECT statement and return the actual result rows. Input must be a complete valid SQL statement.",
    )

    return ReActAgent(
        tools=[schema_tool, sql_tool],
        llm=llm,
        verbose=True,
        system_prompt=SQL_REACT_SYSTEM_PROMPT,
        user_prompt=USER_PROMPT_TEMPLATE,
        callback_manager=_callback_manager,
    )


def build_query_engine(user_question: str | None = None) -> Any:
    global _agent
    if user_question:
        preview = user_question[:200] + ("..." if len(user_question) > 200 else "")
        print("[question]", preview)
    if _agent is None:
        print("[agent] Building agent (first request)...")
        _agent = _build_agent()
    return _agent


def format_user_prompt(question: str) -> str:
    return USER_PROMPT_TEMPLATE.replace("{question}", question)
