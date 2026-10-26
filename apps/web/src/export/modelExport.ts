import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as modeler from '@realmarket/product-modeler';
import { getProductGeometry, getProductMaterials } from '@realmarket/engine-3d';
import type { SceneData, SceneProduct } from '@realmarket/shared';

/**
 * Unity varlık hattı (tarayıcı tarafı): web istemcisinin kullandığı ürün geometrisi ve etiket
 * dokularını aynen GLB'ye çevirir — iki motor aynı ürün görünümünü paylaşır.
 *
 * Çıktı: ürün başına LOD0 (inceleme) … LOD3 (uzak). Etiket dokusu LOD'a göre küçültülür ve
 * JPEG olarak gömülür (opak). Koordinatlar glTF (sağ elli, metre, taban y=0, ön yüz +z);
 * Unity tarafında glTFast sol elli sisteme çevirir.
 */

type Detail = Parameters<typeof getProductGeometry>[1];
const LOD_LABEL_PX = [1024, 512, 256, 128];

/** product-modeler sürümüne göre desteklenen ayrıntı düzeyleri (eski sürüm: high/low). */
function detailsForLods(): Detail[] {
  const list = (modeler as unknown as { LOD_DETAILS?: readonly string[] }).LOD_DETAILS;
  if (list && list.length >= 4) return list.slice(0, 4) as Detail[];
  return ['high', 'high', 'low', 'low'] as Detail[];
}

function resizedTexture(src: THREE.Texture, width: number): THREE.Texture {
  const img = src.image as HTMLCanvasElement | HTMLImageElement | undefined;
  if (!img || !('width' in img) || img.width <= width) {
    const t = src.clone();
    t.userData = { ...t.userData, mimeType: 'image/jpeg' };
    return t;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(1, Math.round((img.height / img.width) * width));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d yok');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = src.colorSpace;
  t.flipY = src.flipY;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.userData = { mimeType: 'image/jpeg' };
  return t;
}

function exportMaterials(p: SceneProduct, lod: number): THREE.Material[] {
  return getProductMaterials(p).map((m) => {
    const c = m.clone() as THREE.MeshStandardMaterial;
    if (c.map) c.map = resizedTexture(c.map, LOD_LABEL_PX[lod]);
    // Unity tarafı opak instancing kullanır; şeffaflık LOD0 dışında kapatılır
    if (lod > 0) {
      c.transparent = false;
      c.opacity = 1;
    }
    return c;
  });
}

function triangles(g: THREE.BufferGeometry) {
  return Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
}

async function toGlb(obj: THREE.Object3D): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  const out = await exporter.parseAsync(obj, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  if (!(out instanceof ArrayBuffer)) throw new Error('GLB yerine JSON üretildi');
  return out;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface ExportedLod {
  productId: string;
  lod: number;
  detail: string;
  triangles: number;
  base64: string;
  bytes: number;
}

async function exportProduct(p: SceneProduct, details: Detail[]): Promise<ExportedLod[]> {
  const out: ExportedLod[] = [];
  for (let lod = 0; lod < 4; lod++) {
    const geometry = getProductGeometry(p, details[lod]);
    const mesh = new THREE.Mesh(geometry, exportMaterials(p, lod));
    mesh.name = `${p.gtin}-lod${lod}`;
    const root = new THREE.Group();
    root.name = p.name;
    root.add(mesh);
    const glb = await toGlb(root);
    out.push({ productId: p.id, lod, detail: String(details[lod]), triangles: triangles(geometry), base64: toBase64(glb), bytes: glb.byteLength });
  }
  return out;
}

declare global {
  interface Window {
    __rmExport?: (storeId?: string, only?: string[]) => Promise<ExportedLod[]>;
    __rmExportReady?: boolean;
  }
}

const log = (m: string) => {
  const el = document.getElementById('log');
  if (el) el.textContent += `\n${m}`;
};

window.__rmExport = async (storeId = 'demo-market', only?: string[]) => {
  const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/scene`);
  if (!res.ok) throw new Error(`sahne alınamadı: HTTP ${res.status}`);
  const scene = (await res.json()) as SceneData;
  const details = detailsForLods();
  log(`${scene.products.length} ürün, LOD ayrıntıları: ${details.join(', ')}`);
  const all: ExportedLod[] = [];
  for (const p of scene.products) {
    if (only && !only.includes(p.id)) continue;
    const lods = await exportProduct(p, details);
    all.push(...lods);
    log(`${p.name}: ${lods.map((l) => `${l.triangles}△/${Math.round(l.bytes / 1024)}KB`).join(' · ')}`);
  }
  return all;
};
window.__rmExportReady = true;
log('hazır');
