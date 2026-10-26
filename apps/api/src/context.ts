import type { Db } from '@realmarket/database';
import type { ObjectStorage } from './services/storage';
import type { PaymentProvider } from './services/payment';
import type { AuthClaims } from './services/auth';

export interface AppContext {
  db: Db;
  driver: 'pglite' | 'postgres';
  storage: ObjectStorage;
  payment: PaymentProvider;
  authSecret: string;
  offUserAgent: string;
  /** Testlerde ağ çağrısını taklit etmek için. */
  fetchImpl?: typeof fetch;
  /** Ürün GLB modelleri ve manifest.json klasörü (tools/model-export çıktısı). */
  modelsDir?: string;
  /** Başka kökenden sunulan site/Unity derlemesi için CORS izin listesi. */
  corsOrigins?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthClaims;
  }
}
