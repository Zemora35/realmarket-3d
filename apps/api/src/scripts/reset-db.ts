import { rmSync } from 'node:fs';
import { env } from '../env';

// Yalnızca yerel PGlite verisini siler; gerçek PostgreSQL'e dokunmaz.
if (env.databaseUrl) {
  console.error('DATABASE_URL tanımlı: güvenlik için harici veritabanı sıfırlanmaz.');
  process.exit(1);
}
rmSync(env.pgliteDir, { recursive: true, force: true });
console.log(`PGlite verisi silindi: ${env.pgliteDir}. API bir sonraki açılışta demo verisini yeniden yükler.`);
