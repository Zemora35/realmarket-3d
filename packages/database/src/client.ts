import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
/** Her iki sürücü de aynı sorgu API'sini sunar; tip olarak PGlite sürümü kullanılır. */
export type Db = PgliteDatabase<Schema>;

export interface DatabaseHandle {
  db: Db;
  driver: 'pglite' | 'postgres';
  close(): Promise<void>;
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/**
 * DATABASE_URL verilirse gerçek PostgreSQL'e (node-postgres) bağlanır; yoksa
 * gömülü PGlite (WASM PostgreSQL 17) kullanır. `dataDir` yoksa bellek içi çalışır (testler).
 */
export async function createDatabase(options: { databaseUrl?: string; dataDir?: string } = {}): Promise<DatabaseHandle> {
  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as Db;
    await migratePg(drizzlePg(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    return { db, driver: 'postgres', close: () => pool.end() };
  }
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const client = options.dataDir ? new PGlite(options.dataDir) : new PGlite();
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, driver: 'pglite', close: () => client.close() };
}
