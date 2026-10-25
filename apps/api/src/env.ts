import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const apiRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(apiRoot, '../..');

// .env dosyaları (varsa) yüklenir; ortam değişkenleri önceliklidir.
for (const file of [resolve(repoRoot, '.env'), resolve(apiRoot, '.env')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === 'change-me-in-production')) {
  throw new Error('Üretimde AUTH_SECRET zorunludur.');
}

export const env = {
  isProd,
  port: Number(process.env.API_PORT ?? 3001),
  host: process.env.API_HOST ?? '127.0.0.1',
  databaseUrl: process.env.DATABASE_URL || undefined,
  pgliteDir: resolve(apiRoot, process.env.PGLITE_DIR ?? '.data/pglite'),
  // Geliştirmede anahtar verilmezse her açılışta rastgele üretilir (oturumlar yeniden başlatmada düşer).
  authSecret: process.env.AUTH_SECRET || randomBytes(32).toString('hex'),
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@realmarket.local',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || undefined,
  storageDir: resolve(apiRoot, process.env.STORAGE_DIR ?? 'storage'),
  offUserAgent: process.env.OFF_USER_AGENT ?? 'RealMarket3D/0.1 (development)',
};
