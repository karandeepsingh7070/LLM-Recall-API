import { pgTable, text, timestamp, uuid, jsonb, vector } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  userId: text('user_id').primaryKey(),
  staticFacts: jsonb('static_facts').default('{}'),
  dynamicContext: jsonb('dynamic_context').default('{}'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const memories = pgTable('memories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  type: text('type').notNull(), // 'Preference', 'Task', 'Observation'
  status: text('status').default('active').notNull(), // 'active', 'outdated'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});
