import { describe, expect, it } from 'vitest';
import { priceCart } from './pricing';
import { CART_BASKET, packCart } from './cart-packing';

describe('sepet fiyatlandırma', () => {
  it('toplamları kuruş hassasiyetinde hesaplar', () => {
    const r = priceCart([
      { storeProductId: 'a', quantity: 2, unitPriceKurus: 3450 },
      { storeProductId: 'b', quantity: 1, unitPriceKurus: 1250 },
    ]);
    expect(r.subtotalKurus).toBe(8150);
    expect(r.totalKurus).toBe(8150);
    expect(r.itemCount).toBe(3);
  });

  it('yüzde indirimi uygular', () => {
    const r = priceCart([{ storeProductId: 'a', quantity: 3, unitPriceKurus: 4250, promotion: { type: 'percent', percent: 20 } }]);
    expect(r.discountKurus).toBe(2550);
    expect(r.totalKurus).toBe(10200);
    expect(r.lines[0].promotionLabel).toBe('%20 indirim');
  });

  it('X al Y öde kampanyasını uygular', () => {
    const promo = { type: 'multibuy' as const, buy: 3, pay: 2 };
    expect(priceCart([{ storeProductId: 'a', quantity: 2, unitPriceKurus: 2750, promotion: promo }]).discountKurus).toBe(0);
    expect(priceCart([{ storeProductId: 'a', quantity: 3, unitPriceKurus: 2750, promotion: promo }]).discountKurus).toBe(2750);
    expect(priceCart([{ storeProductId: 'a', quantity: 7, unitPriceKurus: 2750, promotion: promo }]).discountKurus).toBe(5500);
  });

  it('geçersiz miktarı reddeder', () => {
    expect(() => priceCart([{ storeProductId: 'a', quantity: 1.5, unitPriceKurus: 100 }])).toThrow();
  });
});

describe('araba yerleşimi', () => {
  it('ürünleri sepet içine yerleştirir, eklenen ürün öncekileri oynatmaz', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, w: 0.08, h: 0.25, d: 0.08 }));
    const a = packCart(items.slice(0, 3));
    const b = packCart(items);
    expect(b.items.slice(0, 3)).toEqual(a.items);
    for (const it of b.items) {
      expect(Math.abs(it.x)).toBeLessThanOrEqual(CART_BASKET.width / 2);
      expect(Math.abs(it.z)).toBeLessThanOrEqual(CART_BASKET.length / 2);
      expect(it.overflow).toBe(false);
    }
  });

  it('uzun şişeyi yatırır ve hacim oranını hesaplar', () => {
    const r = packCart([{ key: 'su', w: 0.088, h: 0.4, d: 0.088 }]);
    expect(r.items[0].lying).toBe(true);
    expect(r.volumeRatio).toBeGreaterThan(0);
  });
});
