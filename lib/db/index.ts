import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalForPool = globalThis as unknown as { __pgPool?: Pool }

export const pool =
  globalForPool.__pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })

if (process.env.NODE_ENV !== 'production') globalForPool.__pgPool = pool

export const db = drizzle(pool, { schema })
