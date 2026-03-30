# AskDB-AI

Ask questions about your database in plain English. Get SQL, results, and answers — instantly.

![Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat) ![Stack](https://img.shields.io/badge/AI-Claude%20(Anthropic)-blueviolet?style=flat) ![Stack](https://img.shields.io/badge/Frontend-Angular-DD0031?style=flat) ![Stack](https://img.shields.io/badge/DB-PostgreSQL-336791?style=flat)

---

## What it does

- Type a question like *"Which customers placed the most orders?"*
- The AI agent generates the SQL, runs it against your PostgreSQL database, and streams the answer back in real time
- Browse any table visually in the Explorer
- Copilot suggestions auto-update based on whichever table you're viewing

---

## Architecture

```
User Question
     │
     ▼
Angular Frontend  ──SSE stream──▶  FastAPI Backend
                                        │
                              LlamaIndex SQL Agent
                                        │
                              Claude (claude-haiku)
                                        │
                              PostgreSQL Database
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 17, TypeScript |
| Backend | FastAPI, Python |
| AI Agent | LlamaIndex + Anthropic Claude |
| Database | PostgreSQL (Neon) |
| Embeddings | FastEmbed (BAAI/bge-small, local) |

---

## Key Features

- **Natural language → SQL** — powered by a LlamaIndex agent with custom prompt tuning
- **Real-time streaming** — tokens stream from Claude to the UI via Server-Sent Events
- **Context-aware suggestions** — Copilot reads the active table's schema and generates relevant questions using Claude Haiku, cached per table
- **Table Explorer** — paginated data grid with search, avatars, and badge rendering
- **Read-only safety** — all queries are sandboxed, no writes allowed

---

## Running Locally

**Backend**
```bash
cd backend
cp .env.example .env          # add your ANTHROPIC_API_KEY
uvicorn api:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
ng serve --proxy-config proxy.conf.json
```

Open `http://localhost:4200`

---

## Environment Variables

```env
ANTHROPIC_API_KEY=your-key-here
```

Database connection goes in `backend/config.yaml` under the `postgres` block.

---

## Project Structure

```
AskDB-AI/
├── backend/
│   ├── api.py                  # FastAPI app + startup
│   ├── database.py             # SQLAlchemy engine
│   ├── routes/
│   │   ├── chat.py             # SSE streaming endpoint
│   │   ├── tables.py           # Table data + metadata
│   │   └── ai.py               # AI suggestions endpoint
│   └── query_agent/
│       ├── engine/             # LlamaIndex agent builder
│       └── prompts/            # SQL prompt templates
└── frontend/
    └── src/app/
        ├── pages/
        │   ├── chat/           # Copilot chat panel
        │   └── explorer/       # Table data grid
        └── services/
            ├── db.service.ts   # API client
            └── shared-state.service.ts  # Active table state
```
