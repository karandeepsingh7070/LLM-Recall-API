# LLM Recall API Walkthrough

I have successfully built the core of the LLM Recall API in TypeScript, adhering closely to the steps in your roadmap. Here is a step-by-step breakdown of how everything works and connects!

## 1. Storage Layer & Data Schemas
We initialized a Node.js project using **Drizzle ORM** and **PostgreSQL (with `pgvector`)**.
*   **[src/db/schema.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/db/schema.ts):** We created two primary tables: `Profiles` and `Memories`. The `Memories` schema directly leverages pgvector's `vector('embedding', { dimensions: 768 })` type to store our semantic embeddings efficiently alongside relational data.
*   **[docker-compose.yml](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/docker-compose.yml):** Simplifies starting up Postgres with pgvector pre-installed via a Docker container.

## 2. Ingestion & Extraction Engine
*   **[src/local-models.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/local-models.ts):** Runs everything on-device via **transformers.js** (`@huggingface/transformers`), no API key or network calls after the first model download:
    *   `Xenova/gte-base` for embeddings — 768 dimensions, matching the pgvector column.
    *   `onnx-community/Qwen2.5-1.5B-Instruct` for fact extraction and the contradiction check, quantized to `q8` for speed on CPU.
*   **[src/extraction.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/extraction.ts):** Local models don't offer native structured-output enforcement the way Gemini's `responseSchema` did, so we prompt the model for JSON explicitly, then parse and validate the response against the **Zod schema** in **[src/types.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/types.ts)** ourselves — if the model's output doesn't parse or match the schema, we throw a clear error with the raw output rather than silently failing.

## 3. Conflict Resolution & Temporal Logic
*   **[src/memory.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/memory.ts):** When inserting a new memory, we don't just shove it in. We perform a **Cosine Similarity check** using pgvector (`1 - (embedding <=> new_embedding)`) to pull active facts with >0.55 similarity.
*   If we find similar facts, we perform an **LLM Verification pass** using the local Qwen2.5 model: we ask it if the new fact contradicts or supersedes the old one. If "YES", we soft-delete the old fact by marking its status as `outdated`. If "NO" and it's extremely similar, we assume it's a duplicate and prevent redundant database clutter.

## 4. Hybrid Retrieval API
*   **[src/retrieval.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/retrieval.ts):** Context generation requires speed and accuracy. I built a true Hybrid Search that runs natively in SQL. It merges:
    *   **Vector Search** (Semantic similarity via pgvector).
    *   **Full Text Search (FTS)** (Keyword extraction using Postgres `to_tsvector` and `to_tsquery`).
*   These two results are joined and sorted using **Reciprocal Rank Fusion (RRF)**, which mathematically balances exact keywords and broad concepts.

## 5. SDK & Integration Layer
*   **[src/server.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/server.ts):** The entire system is exposed via a blazing-fast **Hono** REST API (`/memory`, `/search`, `/profile`).
*   **[src/mcp.ts](file:///Users/nexg/Desktop/Learning/Test%20projects/LLM-recall-api/src/mcp.ts):** We also wrapped the core logic in a **Model Context Protocol (MCP)** server. You can compile this file and add it to Cursor or Claude Desktop to instantly give those LLMs access to query and append to your local memory engine!

---

### How to Run it!

1. Start the database:
```bash
cd "/Users/nexg/Desktop/Learning/Test projects/LLM-recall-api"
docker compose up -d
```
2. Enable the pgvector extension (one-time, required before the first push):
```bash
docker exec llm-recall-api-db-1 psql -U myuser -d llm_recall_api -c "CREATE EXTENSION IF NOT EXISTS vector;"
```
3. Generate the migrations and push them to the database:
```bash
npx drizzle-kit push
```
4. Create a `.env` file (no API key needed anymore — everything runs locally):
```env
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/llm_recall_api
```
5. Pre-download the local models (~2GB total, one-time). This must run with plain `node`, not `tsx` — a fresh (uncached) download intermittently fails under `tsx`'s loader hooks with "Unable to get model file path or buffer.":
```bash
npm run warm-models
```
6. Run the API Server:
```bash
npx tsx src/server.ts
```
Once models are cached, everything runs offline — no network access needed after this point.
