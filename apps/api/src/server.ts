import { env } from './env';
import { createDatabase } from '@realmarket/database';
import { buildApp } from './app';
import { releaseStaleSessions } from './services/cart';
import { DemoPaymentProvider } from './services/payment';
import { seedDemo } from './services/seed';
import { LocalStorage } from './services/storage';

const handle = await createDatabase({ databaseUrl: env.databaseUrl, dataDir: env.databaseUrl ? undefined : env.pgliteDir });
console.log(`[db] ${handle.driver === 'pglite' ? `PGlite (${env.pgliteDir})` : 'PostgreSQL'} hazır, migration'lar uygulandı`);

const seed = await seedDemo(handle.db, {
  adminEmail: env.seedAdminEmail,
  adminPassword: env.seedAdminPassword,
  log: (m) => console.log(`[seed] ${m}`),
});
if (seed.seeded) {
  console.log(`[seed] admin kullanıcısı: ${env.seedAdminEmail}`);
  if (seed.generatedPassword) {
    // SEED_ADMIN_PASSWORD verilmediyse tek seferlik parola yalnızca bu konsolda görünür.
    console.log(`[seed] SEED_ADMIN_PASSWORD tanımlı değil; üretilen tek seferlik parola: ${seed.generatedPassword}`);
  }
}

const app = await buildApp(
  {
    db: handle.db,
    driver: handle.driver,
    storage: new LocalStorage(env.storageDir),
    payment: new DemoPaymentProvider(),
    authSecret: env.authSecret,
    offUserAgent: env.offUserAgent,
    modelsDir: env.modelsDir,
    corsOrigins: env.corsOrigins,
  },
  { logger: env.isProd },
);

await releaseStaleSessions(handle.db).catch(() => 0);
const sweeper = setInterval(() => void releaseStaleSessions(handle.db).catch(() => 0), 10 * 60_000);

await app.listen({ port: env.port, host: env.host });
console.log(`[api] http://${env.host}:${env.port}  (OpenAPI: /api/docs)`);

const shutdown = async () => {
  clearInterval(sweeper);
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
