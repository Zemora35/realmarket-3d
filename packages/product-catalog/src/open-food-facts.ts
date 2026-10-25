import type { RawRow } from './import';

/**
 * Open Food Facts adaptörü.
 * - Veri lisansı: Open Database License (ODbL 1.0) — atıf ve paylaşım koşulları geçerli.
 * - Görseller: Creative Commons BY-SA 3.0 (görsel bazında farklı olabilir).
 * - API kuralları: tanımlayıcı User-Agent zorunlu; ürün okuma ~100 istek/dakika.
 *   Toplu veri için https://world.openfoodfacts.org/data adresindeki JSONL dökümü önerilir.
 * Kaynak: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */
export const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_tr',
  'brands',
  'quantity',
  'categories_tags',
  'packaging',
  'packaging_tags',
  'image_front_url',
  'countries_tags',
  'manufacturing_places',
].join(',');

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_tr?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  packaging?: string;
  packaging_tags?: string[];
  image_front_url?: string;
  countries_tags?: string[];
  manufacturing_places?: string;
}

/** OFF ürün nesnesini içe aktarma hattının ham satırına çevirir (ölçü OFF'ta yoktur → eksik işaretlenir). */
export function offProductToRow(p: OffProduct): RawRow {
  const categories = (p.categories_tags ?? []).map((c) => c.replace(/^[a-z]{2}:/, '').replace(/-/g, ' '));
  return {
    gtin: p.code,
    name: p.product_name_tr || p.product_name,
    brand: p.brands,
    quantity: p.quantity,
    category: 'GENEL',
    categories: categories.join(' '),
    packaging: [p.packaging, ...(p.packaging_tags ?? [])].filter(Boolean).join(' '),
    image_url: p.image_front_url,
    image_license: p.image_front_url ? 'CC-BY-SA-3.0' : undefined,
    manufacturer: p.manufacturing_places,
    source_ref: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : undefined,
  };
}

/** Basit hız sınırlayıcı: ardışık çağrılar arasında en az `intervalMs`. */
export class RateLimiter {
  private next = 0;
  constructor(private intervalMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export interface OffClientOptions {
  userAgent: string;
  fetchImpl?: typeof fetch;
  /** Varsayılan 650 ms ≈ 92 istek/dk (OFF sınırı 100/dk). */
  intervalMs?: number;
}

export function createOffClient(options: OffClientOptions) {
  if (!options.userAgent || options.userAgent.length < 8) {
    throw new Error('Open Food Facts için tanımlayıcı bir User-Agent zorunludur (OFF_USER_AGENT).');
  }
  const limiter = new RateLimiter(options.intervalMs ?? 650);
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async getProduct(gtin: string): Promise<OffProduct | null> {
      await limiter.wait();
      const res = await doFetch(`${OFF_API_BASE}/${encodeURIComponent(gtin)}.json?fields=${OFF_FIELDS}`, {
        headers: { 'User-Agent': options.userAgent, Accept: 'application/json' },
      });
      if (res.status === 404) return null;
      if (res.status === 429) throw new Error('Open Food Facts hız sınırı aşıldı (429). Daha sonra tekrar deneyin.');
      if (!res.ok) throw new Error(`Open Food Facts hatası: HTTP ${res.status}`);
      const body = (await res.json()) as { status?: number; product?: OffProduct };
      if (body.status !== 1 || !body.product) return null;
      return { ...body.product, code: body.product.code ?? gtin };
    },
  };
}
