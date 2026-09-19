import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://myuser:mypassword@localhost:5432/llm_recall_api';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
