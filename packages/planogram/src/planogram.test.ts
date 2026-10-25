import { describe, expect, it } from 'vitest';
import type { Planogram } from '@realmarket/shared';
import { computePlacements, expandSlotUnits } from './placement';
import { csvAdapter, jsonAdapter, plnAdapter } from './adapters';

const dims = { widthMm: 80, heightMm: 250, depthMm: 80, verified: true };
const base: Planogram = {
  format: 'realmarket-planogram',
  version: 1,
  storeId: 's1',
  planogramId: 'p1',
  aisleId: 'ICECEK',
  shelfId: 'G1-A-01',
  fixture: {
    kind: 'gondola',
    widthMm: 1000,
    depthMm: 480,
    heightMm: 1950,
    levels: [
      { index: 0, heightFromBaseMm: 120, clearanceMm: 350 },
      { index: 1, heightFromBaseMm: 500, clearanceMm: 200 },
    ],
  },
  items: [{ gtin: '2900000010014', levelIndex: 0, facings: 5 }],
};

describe('planogram yerleşimi', () => {
  it('facing ve derinlik sayısını uygular', () => {
    const r = computePlacements(base, () => dims);
    expect(r.issues).toEqual([]);
    expect(r.slots).toHaveLength(1);
    expect(r.slots[0].facings).toBe(5);
    expect(r.slots[0].depthCount).toBe(6);
    expect(r.slots[0].capacity).toBe(30);
    expect(r.slots[0].yMm).toBe(120);
  });

  it('taşma, yükseklik ve bilinmeyen ürün sorunlarını raporlar', () => {
    const pg: Planogram = {
      ...base,
      items: [
        { gtin: 'A', levelIndex: 0, facings: 20 },
        { gtin: 'B', levelIndex: 1, facings: 1 },
        { gtin: 'X', levelIndex: 0, facings: 1 },
        { gtin: 'A', levelIndex: 5, facings: 1 },
      ],
    };
    const r = computePlacements(pg, (g) => (g === 'X' ? null : { ...dims, verified: g !== 'B' }));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('SHELF_OVERFLOW');
    expect(codes).toContain('HEIGHT_COLLISION');
    expect(codes).toContain('UNKNOWN_PRODUCT');
    expect(codes).toContain('INVALID_LEVEL');
    expect(codes).toContain('UNVERIFIED_DIMENSIONS');
  });

  it('açık konumlarda çakışmayı bulur', () => {
    const pg: Planogram = {
      ...base,
      items: [
        { gtin: 'A', levelIndex: 0, facings: 3, positionXMm: 0, orientation: 'front' },
        { gtin: 'B', levelIndex: 0, facings: 2, positionXMm: 100, orientation: 'front' },
      ],
    };
    const r = computePlacements(pg, () => dims);
    expect(r.issues.map((i) => i.code)).toContain('SLOT_OVERLAP');
  });

  it('birim konumları raf sınırları içinde', () => {
    const r = computePlacements(base, () => dims);
    const units = expandSlotUnits(r.slots[0], 1.0, 0.48);
    expect(units).toHaveLength(30);
    for (const u of units) {
      expect(u.x).toBeGreaterThan(-0.5);
      expect(u.x).toBeLessThan(0.5);
      expect(u.z).toBeLessThanOrEqual(0.24);
      expect(u.z).toBeGreaterThan(-0.24);
    }
  });
});

describe('planogram adaptörleri', () => {
  it('JSON planogramı doğrular', () => {
    const ok = jsonAdapter.read(JSON.stringify(base), { storeId: 's1' });
    expect(ok.planograms).toHaveLength(1);
    const bad = jsonAdapter.read(JSON.stringify({ ...base, version: 2 }), { storeId: 's1' });
    expect(bad.errors.length).toBe(1);
  });

  it('CSV planogramı gruplar', () => {
    const csv = [
      'planogram_id;shelf_id;aisle_id;shelf_width_mm;shelf_depth_mm;shelf_height_mm;level_heights_mm;level_index;gtin;facings',
      'P1;G1-A-01;ICECEK;1250;460;1950;120|500|880;0;2900000010014;4',
      'P1;G1-A-01;ICECEK;1250;460;1950;120|500|880;1;2900000010021;3',
      'P2;G1-A-02;ICECEK;1250;460;1950;120|500;0;2900000010014;2',
      'P3;G1-A-03;ICECEK;;460;1950;120;0;x;1',
    ].join('\n');
    const r = csvAdapter.read(csv, { storeId: 's1' });
    expect(r.planograms).toHaveLength(2);
    expect(r.planograms[0].items).toHaveLength(2);
    expect(r.planograms[0].fixture.levels).toHaveLength(3);
    expect(r.errors).toHaveLength(1);
  });

  it('Excel BOM işaretli CSV başlığını okur', () => {
    const r = csvAdapter.read(
      '﻿planogram_id,shelf_id,shelf_width_mm,shelf_depth_mm,shelf_height_mm,level_heights_mm,level_index,gtin,facings\nP1,G1-A-01,1250,460,1950,120,0,2900000010014,2\n',
      { storeId: 's1' },
    );
    expect(r.errors).toEqual([]);
    expect(r.planograms).toHaveLength(1);
  });

  it('PLN desteğini açıkça desteklenmiyor olarak bildirir', () => {
    expect(plnAdapter.supported).toBe(false);
    expect(plnAdapter.read('', { storeId: 's1' }).errors[0].message).toContain('desteklenmiyor');
  });
});
