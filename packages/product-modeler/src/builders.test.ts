import { describe, expect, it } from 'vitest';
import { PACKAGING_TYPES } from '@realmarket/shared';
import { buildProductGeometry, validateProductGeometry } from './builders';

const variants: Record<string, string[]> = { fruit: ['apple', 'orange', 'banana', 'lemon'], vegetable: ['tomato', 'cucumber'] };

describe('parametrik ambalaj modelleyici', () => {
  for (const type of PACKAGING_TYPES) {
    for (const variant of variants[type] ?? [undefined]) {
      it(`${type}${variant ? `/${variant}` : ''} ölçülere tam oturur`, () => {
        const mm = { widthMm: 92, heightMm: 230, depthMm: 64 };
        for (const detail of ['high', 'low'] as const) {
          const g = buildProductGeometry({
            packagingType: type,
            width: mm.widthMm / 1000,
            height: mm.heightMm / 1000,
            depth: mm.depthMm / 1000,
            shapeVariant: variant,
            detail,
          });
          const v = validateProductGeometry(g, mm);
          expect(v.issues).toEqual([]);
          expect(v.maxScaleErrorPct).toBeLessThan(0.5);
          expect(g.groups.length).toBeGreaterThan(0);
          for (const gr of g.groups) expect([0, 1, 2]).toContain(gr.materialIndex);
          expect(g.boundingBox!.min.y).toBeCloseTo(0, 5);
        }
      });
    }
  }

  it('düşük detay daha az üçgen üretir (LOD)', () => {
    const spec = { packagingType: 'pet_bottle' as const, width: 0.08, height: 0.3, depth: 0.08 };
    const hi = validateProductGeometry(buildProductGeometry({ ...spec, detail: 'high' }), { widthMm: 80, heightMm: 300, depthMm: 80 });
    const lo = validateProductGeometry(buildProductGeometry({ ...spec, detail: 'low' }), { widthMm: 80, heightMm: 300, depthMm: 80 });
    expect(lo.triangleCount).toBeLessThan(hi.triangleCount / 2);
  });

  it('geçersiz ölçüyü reddeder', () => {
    expect(() => buildProductGeometry({ packagingType: 'jar', width: 0, height: 0.1, depth: 0.1 })).toThrow();
  });
});
