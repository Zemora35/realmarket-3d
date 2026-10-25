import { describe, expect, it, vi } from 'vitest';
import { validateGtin } from '@realmarket/shared';
import { DEMO_CATALOG } from './demo-catalog';
import { classifyPackaging } from './classify';
import { parseCatalogContent, processCatalogBatch } from './import';
import { createOffClient, offProductToRow } from './open-food-facts';

describe('demo katalog', () => {
  it('en az 20 farklı ürün, geçerli ve benzersiz barkodlar', () => {
    expect(DEMO_CATALOG.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DEMO_CATALOG.map((p) => p.gtin)).size).toBe(DEMO_CATALOG.length);
    for (const p of DEMO_CATALOG) expect(validateGtin(p.gtin).valid).toBe(true);
    expect(new Set(DEMO_CATALOG.map((p) => p.packagingType)).size).toBeGreaterThanOrEqual(15);
  });
});

describe('ambalaj sınıflandırma', () => {
  it('anahtar kelimelerden tahmin eder', () => {
    expect(classifyPackaging('Patates Cipsi 150 g').packagingType).toBe('chips_bag');
    expect(classifyPackaging('Doğal Kaynak Suyu 1,5 L').packagingType).toBe('pet_bottle');
    expect(classifyPackaging('Çilek Reçeli').packagingType).toBe('jar');
    expect(classifyPackaging('xyz').confidence).toBe('fallback');
  });
});

describe('toplu içe aktarma', () => {
  const csv = [
    'gtin,name,brand,quantity,width_mm,height_mm,depth_mm,image_url',
    '4006381333931,Test Ürün,Marka,500 g,100,200,50,https://example.com/a.jpg',
    '4006381333931,Test Ürün Kopya,,,,,,',
    '4006381333932,Hatalı Barkod,Marka,,,,,',
    '96385074,Patates Cipsi,Marka,150 g,,,,',
  ].join('\n');

  it('barkod doğrular, tekrarları birleştirir, eksikleri işaretler', () => {
    const rows = parseCatalogContent('csv', csv);
    const { products, report } = processCatalogBatch(rows, { dataSource: 'CSV_IMPORT' });
    expect(report.errors).toHaveLength(1);
    expect(report.merged).toBe(1);
    expect(products).toHaveLength(2);
    const chips = products.find((p) => p.gtin === '96385074')!;
    expect(chips.packagingType).toBe('chips_bag');
    expect(chips.flags).toContain('MISSING_DIMENSIONS');
    expect(chips.flags).toContain('HEURISTIC_PACKAGING');
    expect(chips.dimensions.verified).toBe(false);
    expect(report.missingImages).toContain('96385074');
    const first = products.find((p) => p.gtin === '4006381333931')!;
    expect(first.flags).toContain('MISSING_LICENSE');
    expect(first.netWeightG).toBe(500);
  });

  it('imleçle kaldığı yerden devam eder', () => {
    const rows = parseCatalogContent('csv', csv);
    const a = processCatalogBatch(rows, { dataSource: 'CSV_IMPORT', batchSize: 2 });
    expect(a.report.done).toBe(false);
    expect(a.report.cursor).toBe(2);
    const b = processCatalogBatch(rows, { dataSource: 'CSV_IMPORT', cursor: a.report.cursor, batchSize: 2 });
    expect(b.report.done).toBe(true);
    expect(b.report.processed).toBe(2);
  });
});

describe('Open Food Facts adaptörü', () => {
  it('User-Agent olmadan oluşturulamaz', () => {
    expect(() => createOffClient({ userAgent: '' })).toThrow();
  });

  it('ürünü ham satıra çevirir ve lisansı işaretler', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: 1,
          product: { code: '4006381333931', product_name: 'Test', brands: 'Marka', quantity: '330 ml', image_front_url: 'https://img/x.jpg' },
        }),
        { status: 200 },
      ),
    );
    const client = createOffClient({ userAgent: 'RealMarket3D/test (dev)', fetchImpl: fetchImpl as unknown as typeof fetch, intervalMs: 0 });
    const p = await client.getProduct('4006381333931');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const row = offProductToRow(p!);
    expect(row.image_license).toBe('CC-BY-SA-3.0');
    const { products } = processCatalogBatch([row], { dataSource: 'OPEN_FOOD_FACTS', dataLicense: 'ODbL-1.0' });
    expect(products[0].volumeMl).toBe(330);
    expect(products[0].flags).toContain('MISSING_DIMENSIONS');
  });
});
