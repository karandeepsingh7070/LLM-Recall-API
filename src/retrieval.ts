import { db } from './db';
import { memories } from './db/schema';
import { generateEmbedding } from './extraction';
import { sql } from 'drizzle-orm';

export async function searchMemories(userId: string, query: string, limit = 5) {
  const queryEmbedding = await generateEmbedding(query);
  
  // Hybrid Search: Reciprocal Rank Fusion (RRF)
  // Combines Dense (Vector) Search with Sparse (Full Text) Search
  
  const searchResults = await db.execute(sql`
    WITH vector_search AS (
      SELECT id, content, type,
             ROW_NUMBER() OVER (ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as vector_rank
      FROM ${memories}
      WHERE user_id = ${userId} AND status = 'active'
      ORDER BY vector_rank
      LIMIT 20
    ),
    fts_search AS (
      SELECT id, content, type,
             ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) DESC) as fts_rank
      FROM ${memories}
      WHERE user_id = ${userId} AND status = 'active'
        AND to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
      ORDER BY fts_rank
      LIMIT 20
    )
    SELECT
      COALESCE(v.id, f.id) as id,
      COALESCE(v.content, f.content) as content,
      COALESCE(v.type, f.type) as type,
      -- RRF Score: 1 / (k + rank), typically k=60
      (1.0 / (60 + COALESCE(v.vector_rank, 100))) + (1.0 / (60 + COALESCE(f.fts_rank, 100))) as rrf_score
    FROM vector_search v
    FULL OUTER JOIN fts_search f ON v.id = f.id
    ORDER BY rrf_score DESC
    LIMIT ${limit};
  `);
  
  // drizzle + postgres.js returns the array of rows directly
  return searchResults;
}

export async function getProfile(userId: string) {
  // A lightweight way to get the user's cached profile and facts
  const profileMemories = await db.execute(sql`
    SELECT content, type
    FROM ${memories}
    WHERE user_id = ${userId} AND status = 'active'
    ORDER BY created_at DESC
  `);

  return {
    userId,
    activeFacts: profileMemories
  };
}

export async function getStats(userId: string) {
  const rows = await db.execute(sql`
    SELECT status, type, count(*)::int as count
    FROM ${memories}
    WHERE user_id = ${userId}
    GROUP BY status, type
  `);

  let active = 0;
  let outdated = 0;
  const byType: Record<string, number> = { Preference: 0, Task: 0, Observation: 0 };

  for (const row of rows as unknown as { status: string; type: string; count: number }[]) {
    if (row.status === 'active') {
      active += row.count;
      byType[row.type] = (byType[row.type] ?? 0) + row.count;
    } else {
      outdated += row.count;
    }
  }

  return { userId, active, outdated, total: active + outdated, byType };
}
