# LLM Recall API

![LLM Recall API](assets/banner.webp)

A self-hosted memory engine for LLM applications. It extracts atomic facts from free-form text, embeds and stores them in Postgres with `pgvector`, resolves contradictions between old and new facts automatically, and exposes hybrid (vector + keyword) search over everything it remembers.

Runs **fully locally** — fact extraction, embeddings, and contradiction-checking all happen on-device via [transformers.js](https://github.com/huggingface/transformers.js), no API keys or external LLM calls required.

## Features

- **Fact extraction** — turns raw text into atomic, typed facts (`Preference`, `Task`, `Observation`), each flagged as time-sensitive or permanent.
- **Semantic + keyword hybrid search** — combines pgvector cosine similarity with Postgres full-text search, merged via Reciprocal Rank Fusion (RRF).
- **Conflict resolution** — before inserting a new fact, checks it against similar existing facts; a local LLM decides whether it supersedes (soft-deletes the old one) or duplicates (skips insert) it.
- **Temporal logic** — time-sensitive facts get a 7-day expiration.
- **REST API** (Hono) and an **MCP server** — use it as a plain HTTP API or plug it into Claude Desktop / Cursor as a memory tool.

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js + TypeScript |
| API | [Hono](https://hono.dev) |
| Database | PostgreSQL + [pgvector](https://github.com/pgvector/pgvector) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Local models | [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) |
| Embeddings | `Xenova/gte-base` (768-dim) |
| Extraction / reasoning | `onnx-community/Llama-3.2-3B-Instruct-ONNX` (q8) |
| Validation | Zod |
| Protocol | [MCP](https://modelcontextprotocol.io) SDK |

## Prerequisites

- Node.js 22+
- Docker (for Postgres + pgvector)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the database**
   ```bash
   docker compose up -d
   ```

3. **Enable the pgvector extension** (one-time)
   ```bash
   docker exec llm-recall-api-db-1 psql -U myuser -d llm_recall_api -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

4. **Push the schema**
   ```bash
   npm run db:push
   ```

5. **Create a `.env` file**
   ```env
   DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/llm_recall_api
   ```

6. **Pre-download the local models** (~2GB, one-time — must run with plain `node`, not `tsx`)
   ```bash
   npm run warm-models
   ```

7. **Start the server**
   ```bash
   npm run dev
   ```

Once the models are cached, everything runs offline.

## Playground

Open **http://localhost:3000** while the server is running for an interactive playground — feed it text, search what it remembers, and watch a live gauge of active vs. outdated facts as the conflict-resolution logic runs. It's a static page in [public/index.html](public/index.html), served directly by the API (same origin, real requests, no mock data).

![Playground demo](assets/playground-demo.gif)

## API

### `POST /memory`
Extract and store facts from raw text.
```bash
curl -X POST http://localhost:3000/memory \
  -H "Content-Type: application/json" \
  -d '{"userId":"alice","text":"I love hiking on weekends and I work as a software engineer."}'
```

### `GET /search`
Hybrid vector + full-text search over a user's active facts.
```bash
curl "http://localhost:3000/search?userId=alice&q=job"
```

### `GET /profile/:userId`
All of a user's currently active facts.
```bash
curl http://localhost:3000/profile/alice
```

### `GET /stats/:userId`
Aggregate counts: active/outdated totals and a breakdown by fact type. Powers the playground's gauge.
```bash
curl http://localhost:3000/stats/alice
```

## MCP server

Exposes `add_memory`, `search_memory`, and `get_profile` as MCP tools.
```bash
npm run mcp
```
Point Claude Desktop / Cursor's MCP config at this command (via `tsx src/mcp.ts`) to give the assistant persistent memory backed by this API.

## Project structure

```
src/
  db/
    schema.ts       # Drizzle schema: profiles, memories (pgvector column)
    index.ts        # DB client
  local-models.ts   # transformers.js pipelines (embedding + generation)
  extraction.ts     # fact extraction + embedding generation
  memory.ts         # conflict resolution, temporal logic, insert pipeline
  retrieval.ts      # hybrid search (RRF) + profile lookup
  server.ts         # Hono REST API
  mcp.ts            # MCP server
  types.ts          # Zod schemas
scripts/
  warm-models.mjs   # pre-downloads local models (run with node, not tsx)
public/
  index.html        # interactive playground, served at /
```

## Known limitations

- The local 1.5B model is noticeably weaker than a hosted model like Gemini at nuanced contradiction detection — it reliably catches near-identical phrasing (e.g. "I use Windows" → "I switched to Mac") but can miss more indirect contradictions (e.g. "I'm a software engineer" → "I quit my job"). Swap the model in [`src/local-models.ts`](src/local-models.ts) for a larger variant (e.g. `Qwen2.5-3B-Instruct` or `7B-Instruct`) for better reasoning at the cost of speed and download size.
- No automatic purge of expired (time-sensitive) facts — `expiresAt` is stored but nothing currently sweeps it.
