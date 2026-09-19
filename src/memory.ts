import { db } from './db';
import { memories } from './db/schema';
import { extractFacts, generateEmbedding } from './extraction';
import { eq, sql, desc } from 'drizzle-orm';
import { generateLocalText } from './local-models';

export async function processAndStoreMemory(userId: string, userInput: string) {
  // 1. Extract structured facts from user input
  const facts = await extractFacts(userInput);
  const insertedMemories = [];

  for (const fact of facts) {
    // 2. Generate embedding for the new fact
    const embedding = await generateEmbedding(fact.content);
    
    // 3. Find similar active facts (Cosine similarity check > 0.55)
    // pgvector's <=> is cosine distance. Cosine Similarity = 1 - distance.
    // Lowered from 0.85: two facts that contradict each other (e.g. "works as
    // an engineer" vs "quit my job") often land around 0.6-0.7 similarity
    // since they share topic/subject but not wording, so 0.85 let real
    // contradictions through without ever reaching the LLM check below.
    const similarityScore = sql<number>`1 - (${memories.embedding} <=> ${JSON.stringify(embedding)}::vector)`;

    const similarMemories = await db
      .select({
        id: memories.id,
        content: memories.content,
        similarity: similarityScore,
      })
      .from(memories)
      .where(sql`${memories.userId} = ${userId} AND ${memories.status} = 'active' AND ${similarityScore} > 0.55`)
      .orderBy(desc(similarityScore))
      .limit(3);

    let shouldInsert = true;

    // 4. Conflict Resolution & Temporal Logic
    for (const oldMemory of similarMemories) {
      // LLM verification for contradiction
      const system = 'You are a strict logical contradiction checker. You only answer with a single word: YES or NO.';
      const prompt = `Old fact: "${oldMemory.content}"\nNew fact: "${fact.content}"\n\nDoes the new fact make the old fact outdated, false, or no longer true? Answer YES or NO only.`;

      const text = await generateLocalText(prompt, system);
      const upper = text.trim().toUpperCase();
      // Small local models sometimes wrap the answer in extra chatter despite
      // instructions, so match the word rather than requiring an exact reply.
      const response = upper.includes('YES') ? 'YES' : upper.includes('NO') ? 'NO' : upper;

      if (response === 'YES') {
        // Soft-delete the old memory because it's outdated
        await db.update(memories)
          .set({ status: 'outdated' })
          .where(eq(memories.id, oldMemory.id));
      } else if (response === 'NO' && oldMemory.similarity > 0.95) {
          // If it doesn't contradict but it's extremely similar, it's likely a duplicate. 
          // We can skip inserting to save space.
          shouldInsert = false;
      }
    }

    if (shouldInsert) {
      // 5. Temporal logic: Tag time-sensitive facts with an expiration date (e.g., 7 days)
      const expiresAt = fact.timeSensitive 
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
        : null;
      
      const [newMem] = await db.insert(memories).values({
        userId,
        content: fact.content,
        embedding: embedding,
        type: fact.type,
        expiresAt,
      }).returning();
      
      insertedMemories.push(newMem);
    }
  }
  
  return insertedMemories;
}
