import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { processAndStoreMemory } from './memory';
import { searchMemories, getProfile, getStats } from './retrieval';

const app = new Hono();

app.use('*', cors());

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

app.use('/*', serveStatic({ root: './public' }));

app.post('/memory', async (c) => {
  const { userId, text } = await c.req.json();
  if (!userId || !text) {
    return c.json({ error: 'userId and text are required' }, 400);
  }
  
  const memories = await processAndStoreMemory(userId, text);
  return c.json({ success: true, inserted: memories });
});

app.get('/search', async (c) => {
  const userId = c.req.query('userId');
  const query = c.req.query('q');
  
  if (!userId || !query) {
    return c.json({ error: 'userId and q (query) are required' }, 400);
  }
  
  const results = await searchMemories(userId, query);
  return c.json({ results });
});

app.get('/profile/:userId', async (c) => {
  const userId = c.req.param('userId');
  const profile = await getProfile(userId);
  return c.json(profile);
});

app.get('/stats/:userId', async (c) => {
  const userId = c.req.param('userId');
  const stats = await getStats(userId);
  return c.json(stats);
});

const port = 3000;
console.log(`LLM Recall API is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
