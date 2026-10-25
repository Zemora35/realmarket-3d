import { describe, expect, it } from 'vitest';
import { fixtureLocalToWorld, generateStoreLayout } from './generate';

describe('parametrik mağaza üretimi', () => {
  it('varsayılan mağaza kabul kriterlerini karşılar', () => {
    const layout = generateStoreLayout();
    expect(layout.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(layout.shelves.length).toBeGreaterThanOrEqual(10);
    expect(new Set(layout.shelves.map((s) => s.departmentCode)).size).toBeGreaterThanOrEqual(5);
    expect(layout.checkouts.length).toBe(3);
    expect(layout.objects.some((o) => o.type === 'door' && o.meta?.kind === 'entrance')).toBe(true);
    expect(layout.objects.some((o) => o.type === 'cart_corral')).toBe(true);
  });

  it('aynı girdilerle aynı yerleşimi üretir (deterministik)', () => {
    const a = generateStoreLayout({ seed: 7, widthM: 40 });
    const b = generateStoreLayout({ seed: 7, widthM: 40 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('dar koridoru araba geçişi için reddeder', () => {
    const layout = generateStoreLayout({ aisleWidthM: 1.2 });
    expect(layout.issues.some((i) => i.severity === 'error' && i.message.includes('arabası'))).toBe(true);
  });

  it('raflar mağaza sınırları içinde ve birbirleriyle çakışmıyor', () => {
    const layout = generateStoreLayout();
    const { widthM, lengthM } = layout.params;
    for (const o of layout.obstacles) {
      expect(o.minX).toBeGreaterThanOrEqual(0);
      expect(o.maxX).toBeLessThanOrEqual(widthM);
      expect(o.minZ).toBeGreaterThanOrEqual(0);
      expect(o.maxZ).toBeLessThanOrEqual(lengthM);
    }
    for (let i = 0; i < layout.obstacles.length; i++) {
      for (let j = i + 1; j < layout.obstacles.length; j++) {
        const a = layout.obstacles[i];
        const b = layout.obstacles[j];
        const overlap = a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minZ < b.maxZ - 1e-6 && b.minZ < a.maxZ - 1e-6;
        expect(overlap, `${i}-${j}`).toBe(false);
      }
    }
  });

  it('raf ön yüzü erişim noktasına bakar', () => {
    const layout = generateStoreLayout();
    for (const s of layout.shelves) {
      const front = fixtureLocalToWorld(s, 0, s.depthM / 2 + 0.5);
      const dFront = Math.hypot(front.x - s.accessPoint.x, front.z - s.accessPoint.z);
      const back = fixtureLocalToWorld(s, 0, -s.depthM / 2 - 0.5);
      const dBack = Math.hypot(back.x - s.accessPoint.x, back.z - s.accessPoint.z);
      expect(dFront, s.id).toBeLessThan(dBack);
    }
  });

  it('küçük mağazada gondol sayısını uyarıyla azaltır', () => {
    const layout = generateStoreLayout({ widthM: 20, gondolaCount: 10 });
    expect(layout.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(layout.objects.filter((o) => o.type === 'gondola').length).toBeLessThan(10);
  });
});
