import * as THREE from 'three';
import { formatPrice, formatQuantity, type PackagingType, type SceneProduct } from '@realmarket/shared';
import { drawBarcode } from './barcode-draw';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, maxW: number, maxSize: number) {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 8 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

/**
 * Doku bölgesine fiziksel en-boy oranını koruyarak çizer. rotated=true: yatırılmış ürünler
 * (bisküvi rulosu, tüp) için okuma yönü dokunun dikey eksenidir.
 */
function withPanel(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  physW: number,
  physH: number,
  rotated: boolean,
  draw: (vw: number, vh: number) => void,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (!rotated) {
    const vw = rect.w;
    const vh = (vw * physH) / physW;
    ctx.translate(rect.x, rect.y);
    ctx.scale(1, rect.h / vh);
    draw(vw, vh);
  } else {
    const vw = rect.h;
    const vh = (vw * physH) / physW;
    ctx.translate(rect.x, rect.y + rect.h);
    ctx.rotate(-Math.PI / 2);
    ctx.scale(1, rect.w / vh);
    draw(vw, vh);
  }
  ctx.restore();
}

type LabelLayout = 'box' | 'wrap' | 'bag' | 'skin';

/** Etiket bandının fiziksel ölçüleri (metre) — builders.ts profilleriyle uyumlu. */
function labelGeometry(p: SceneProduct): { layout: LabelLayout; frontW: number; frontH: number; sideW: number; topH: number; rotated: boolean } {
  const d = p.dimensions ?? { widthMm: 80, heightMm: 200, depthMm: 80 };
  const w = d.widthMm / 1000;
  const h = d.heightMm / 1000;
  const dep = d.depthMm / 1000;
  const R = Math.min(w, dep) / 2;
  const band: Partial<Record<PackagingType, number>> = {
    pet_bottle: 0.38,
    glass_bottle: 0.37,
    beverage_can: 0.82,
    tin_can: 0.94,
    yogurt_cup: 0.9,
    jar: 0.55,
    shampoo_bottle: 0.56,
    detergent_bottle: 0.54,
    spray: 0.71,
  };
  switch (p.packagingType) {
    case 'carton_box':
    case 'custom':
      return { layout: 'box', frontW: w, frontH: h, sideW: dep, topH: dep, rotated: false };
    case 'milk_carton':
      return { layout: 'box', frontW: w, frontH: h * 0.8, sideW: dep, topH: dep, rotated: false };
    case 'chips_bag':
    case 'pasta_pack':
    case 'pouch':
      return { layout: 'bag', frontW: w, frontH: h, sideW: dep, topH: dep, rotated: false };
    case 'biscuit_pack': {
      const r = Math.min(h, dep) / 2;
      return { layout: 'wrap', frontW: w * 0.86, frontH: Math.PI * r, sideW: w, topH: 0, rotated: true };
    }
    case 'tube':
      return { layout: 'wrap', frontW: w * 0.83, frontH: (Math.PI * (h / 2 + dep / 2)) / 2, sideW: w, topH: 0, rotated: true };
    case 'fruit':
    case 'vegetable':
      return { layout: 'skin', frontW: 1, frontH: 1, sideW: 1, topH: 1, rotated: false };
    case 'shampoo_bottle':
    case 'detergent_bottle': {
      const half = (Math.PI * (w / 2 + dep / 2)) / 2;
      return { layout: 'wrap', frontW: half, frontH: h * (band[p.packagingType] ?? 0.5), sideW: half, topH: 0, rotated: false };
    }
    default:
      return { layout: 'wrap', frontW: Math.PI * R, frontH: h * (band[p.packagingType] ?? 0.5), sideW: Math.PI * R, topH: 0, rotated: false };
  }
}

/** Ön panel: marka, ürün adı, miktar, ÖRNEK rozeti. */
function drawFront(ctx: CanvasRenderingContext2D, p: SceneProduct, vw: number, vh: number, image?: HTMLImageElement | null) {
  const a = p.appearance;
  if (image) {
    const s = Math.max(vw / image.width, vh / image.height);
    ctx.drawImage(image, (vw - image.width * s) / 2, (vh - image.height * s) / 2, image.width * s, image.height * s);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, shade(a.primaryColor, 0.08));
  g.addColorStop(1, shade(a.primaryColor, -0.1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  const textColor = luminance(a.primaryColor) > 0.6 ? a.secondaryColor : '#ffffff';
  const m = vw * 0.07;
  // dekoratif şekiller
  ctx.fillStyle = a.accentColor;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(vw * 0.5, vh * 0.62, vw * 0.36, Math.min(vh * 0.2, vw * 0.36), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = a.secondaryColor;
  ctx.beginPath();
  ctx.moveTo(0, vh * 0.86);
  ctx.quadraticCurveTo(vw * 0.5, vh * 0.78, vw, vh * 0.86);
  ctx.lineTo(vw, vh);
  ctx.lineTo(0, vh);
  ctx.closePath();
  ctx.fill();
  // marka
  const brandSize = fitFont(ctx, p.brand.toLocaleUpperCase('tr-TR'), 800, vw - 2 * m, Math.min(vw * 0.16, vh * 0.12));
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(p.brand.toLocaleUpperCase('tr-TR'), vw / 2, m);
  // ürün adı
  const nameSize = Math.min(vw * 0.1, vh * 0.075);
  ctx.font = `700 ${nameSize}px ${FONT}`;
  const lines = wrapText(ctx, p.name.replace(/\s*\(adet\)/, ''), vw - 2 * m).slice(0, 3);
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, m + brandSize * 1.25 + i * nameSize * 1.12));
  if (a.tagline) {
    ctx.font = `italic 600 ${nameSize * 0.7}px ${FONT}`;
    ctx.fillStyle = luminance(a.accentColor) > 0.55 ? '#222222' : '#ffffff';
    ctx.fillText(a.tagline, vw / 2, vh * 0.6 - nameSize * 0.35);
  }
  // miktar
  const qty = formatQuantity(p.netWeightG, p.volumeMl);
  if (qty) {
    ctx.font = `800 ${Math.min(vw * 0.11, vh * 0.07)}px ${FONT}`;
    ctx.fillStyle = luminance(a.secondaryColor) > 0.6 ? '#1a1a1a' : '#ffffff';
    ctx.textBaseline = 'bottom';
    ctx.fillText(qty, vw / 2, vh - m * 0.6);
  }
  // örnek içerik rozeti (gerçek ambalaj değil)
  if (p.isDemo) {
    const bw = vw * 0.34;
    const bh = Math.min(vw * 0.09, vh * 0.06);
    ctx.fillStyle = '#d7263d';
    ctx.fillRect(vw - bw - m * 0.4, vh * 0.5 - bh * 3.1, bw, bh);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${bh * 0.7}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('ÖRNEK', vw - bw / 2 - m * 0.4, vh * 0.5 - bh * 2.6);
  }
}

/** Yan/arka panel: barkod ve bilgi satırları. */
function drawInfo(ctx: CanvasRenderingContext2D, p: SceneProduct, vw: number, vh: number) {
  const a = p.appearance;
  ctx.fillStyle = shade(a.primaryColor, 0.25);
  ctx.fillRect(0, 0, vw, vh);
  const m = vw * 0.08;
  ctx.fillStyle = luminance(shade(a.primaryColor, 0.25)) > 0.55 ? '#222' : '#fff';
  ctx.font = `700 ${vw * 0.08}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(p.isDemo ? 'Örnek ürün — gerçek değildir' : p.brand, m, m);
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 6; i++) ctx.fillRect(m, m + vw * 0.14 + i * vw * 0.06, (vw - 2 * m) * (0.6 + ((i * 37) % 40) / 100), vw * 0.02);
  ctx.globalAlpha = 1;
  const bw = Math.min(vw - 2 * m, vh * 0.8);
  drawBarcode(ctx, p.gtin, (vw - bw) / 2, Math.min(vh - bw * 0.55, m + vw * 0.6), bw, bw * 0.38);
}

function drawSkin(ctx: CanvasRenderingContext2D, p: SceneProduct, W: number, H: number) {
  const a = p.appearance;
  const variant = a.shapeVariant ?? '';
  ctx.fillStyle = a.primaryColor;
  ctx.fillRect(0, 0, W, H);
  // renk geçişi / allık
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(a.primaryColor, -0.06));
  g.addColorStop(0.5, a.primaryColor);
  g.addColorStop(1, shade(a.secondaryColor, 0.02));
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  // dokusal benekler (deterministik)
  let s = [...p.gtin].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dots = variant === 'orange' || variant === 'lemon' ? 2600 : variant === 'apple' ? 500 : 900;
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = rnd() > 0.5 ? shade(a.primaryColor, 0.12) : shade(a.primaryColor, -0.12);
    ctx.globalAlpha = 0.35;
    const r = variant === 'orange' || variant === 'lemon' ? 1.6 : 2.4;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, r * (0.5 + rnd()), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (variant === 'apple') {
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = shade(a.secondaryColor, 0.05);
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 3;
      const x = rnd() * W;
      ctx.beginPath();
      ctx.moveTo(x, H * 0.15);
      ctx.lineTo(x + (rnd() - 0.5) * 30, H * 0.85);
      ctx.stroke();
    }
  }
  if (variant === 'banana' || variant === 'cucumber') {
    // uçlar koyu
    for (const y0 of [0, H * 0.94]) {
      ctx.fillStyle = a.accentColor;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(0, y0, W, H * 0.06);
    }
    if (variant === 'banana') {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = '#5a3d16';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(rnd() * W, H * 0.1 + rnd() * H * 0.8, 2 + rnd() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = a.secondaryColor;
        ctx.globalAlpha = 0.35;
        ctx.fillRect((i / 12) * W, 0, W / 30, H);
      }
    }
  }
  ctx.globalAlpha = 1;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/** Ürün etiket dokusu (prosedürel; yüklenmiş ön görsel varsa ön panelde o kullanılır). */
export function getLabelTexture(p: SceneProduct): THREE.CanvasTexture {
  const front = p.images.find((i) => i.view === 'front');
  const key = `${p.id}:${front?.url ?? ''}:${p.appearance.primaryColor}:${p.name}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const geo = labelGeometry(p);
  const { c, ctx } = canvas(1024, 512);
  const render = (img?: HTMLImageElement | null) => {
    ctx.clearRect(0, 0, 1024, 512);
    if (geo.layout === 'skin') {
      drawSkin(ctx, p, 1024, 512);
    } else if (geo.layout === 'box') {
      withPanel(ctx, { x: 0, y: 0, w: 512, h: 512 }, geo.frontW, geo.frontH, false, (vw, vh) => drawFront(ctx, p, vw, vh, img));
      withPanel(ctx, { x: 512, y: 0, w: 256, h: 512 }, geo.sideW, geo.frontH, false, (vw, vh) => drawInfo(ctx, p, vw, vh));
      ctx.fillStyle = p.appearance.secondaryColor;
      ctx.fillRect(768, 0, 256, 512);
      ctx.fillStyle = p.appearance.primaryColor;
      ctx.fillRect(768, 180, 256, 152);
    } else if (geo.layout === 'bag') {
      withPanel(ctx, { x: 0, y: 0, w: 512, h: 512 }, geo.frontW, geo.frontH, false, (vw, vh) => drawFront(ctx, p, vw, vh, img));
      ctx.fillStyle = p.appearance.primaryColor;
      ctx.fillRect(512, 0, 512, 512);
      // kaynak dikişleri
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let x = 0; x < 512; x += 8) {
        ctx.fillRect(x, 0, 4, 22);
        ctx.fillRect(x, 490, 4, 22);
      }
    } else {
      withPanel(ctx, { x: 256, y: 0, w: 512, h: 512 }, geo.frontW, geo.frontH, geo.rotated, (vw, vh) => drawFront(ctx, p, vw, vh, img));
      withPanel(ctx, { x: 768, y: 0, w: 256, h: 512 }, geo.sideW / 2, geo.frontH, geo.rotated, (vw, vh) => drawInfo(ctx, p, vw, vh));
      ctx.fillStyle = shade(p.appearance.primaryColor, -0.05);
      ctx.fillRect(0, 0, 256, 512);
      ctx.fillStyle = p.appearance.secondaryColor;
      ctx.fillRect(0, 0, 256, 40);
      ctx.fillRect(0, 472, 256, 40);
    }
  };
  render(null);
  const tex = toTexture(c);
  if (front) {
    const img = new Image();
    img.onload = () => {
      render(img);
      tex.needsUpdate = true;
    };
    img.src = front.url;
  }
  labelCache.set(key, tex);
  return tex;
}

const priceCache = new Map<string, THREE.CanvasTexture>();

/** Raf fiyat etiketi: ürün adı, fiyat, birim fiyat, kampanya. */
export function getPriceTagTexture(p: SceneProduct): THREE.CanvasTexture {
  const key = `${p.storeProductId}:${p.priceKurus}:${JSON.stringify(p.promotion ?? null)}`;
  const hit = priceCache.get(key);
  if (hit) return hit;
  const { c, ctx } = canvas(256, 128);
  const promo = !!p.promotion;
  ctx.fillStyle = promo ? '#ffd400' : '#ffffff';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = promo ? '#d7263d' : '#1d4ed8';
  ctx.fillRect(0, 0, 256, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 15px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const label = promo ? (p.promotion!.type === 'percent' ? `%${p.promotion!.percent} İNDİRİM` : `${p.promotion!.buy} AL ${p.promotion!.pay} ÖDE`) : 'RAF FİYATI';
  ctx.fillText(label, 8, 13);
  ctx.fillStyle = '#111111';
  fitFont(ctx, p.name, 600, 240, 16);
  ctx.fillText(p.name, 8, 42);
  ctx.textAlign = 'right';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(formatPrice(p.priceKurus), 248, 84);
  const base = p.volumeMl ?? p.netWeightG;
  if (base && base > 0) {
    ctx.font = `500 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#444';
    ctx.fillText(`${p.volumeMl ? 'L' : 'kg'} fiyatı: ${formatPrice(Math.round((p.priceKurus * 1000) / base))}`, 8, 116);
  }
  const tex = toTexture(c);
  priceCache.set(key, tex);
  return tex;
}

/** Zemin seramiği (60×60 cm karo, derz ve hafif ton farkı). Bir doku tekrarı = 4×4 karo. */
export function makeFloorTextures(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const { c, ctx } = canvas(1024, 1024);
  const { c: rc, ctx: rctx } = canvas(512, 512);
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tile = 256;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const l = 86 + rnd() * 6;
      ctx.fillStyle = `hsl(36, 10%, ${l}%)`;
      ctx.fillRect(x * tile, y * tile, tile, tile);
      for (let k = 0; k < 220; k++) {
        ctx.fillStyle = `hsla(30, 8%, ${l - 8 + rnd() * 16}%, 0.25)`;
        ctx.fillRect(x * tile + rnd() * tile, y * tile + rnd() * tile, 2 + rnd() * 5, 2 + rnd() * 5);
      }
    }
  }
  ctx.fillStyle = '#a7a199';
  for (let i = 0; i <= 4; i++) {
    ctx.fillRect(i * tile - 2, 0, 4, 1024);
    ctx.fillRect(0, i * tile - 2, 1024, 4);
  }
  rctx.fillStyle = '#5a5a5a';
  rctx.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 4000; k++) {
    rctx.fillStyle = `rgba(${120 + rnd() * 60},${120 + rnd() * 60},${120 + rnd() * 60},0.2)`;
    rctx.fillRect(rnd() * 512, rnd() * 512, 3, 3);
  }
  rctx.fillStyle = '#d0d0d0';
  for (let i = 0; i <= 4; i++) {
    rctx.fillRect(i * 128 - 2, 0, 4, 512);
    rctx.fillRect(0, i * 128 - 2, 512, 4);
  }
  return { map: toTexture(c, { repeat: [1, 1] }), rough: toTexture(rc, { repeat: [1, 1], srgb: false }) };
}

/** Asma tavan karoları (60×60). */
export function makeCeilingTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#eceae6';
  ctx.fillRect(0, 0, 256, 256);
  let s = 99;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = `rgba(150,150,150,${rnd() * 0.25})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  ctx.fillStyle = '#c9c6c0';
  ctx.fillRect(0, 0, 256, 5);
  ctx.fillRect(0, 0, 5, 256);
  return toTexture(c, { repeat: [1, 1] });
}

/** Reyon tabelası. */
export function makeSignTexture(text: string, color: string): THREE.CanvasTexture {
  const { c, ctx } = canvas(1024, 256);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, 1024, 90);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, text.toLocaleUpperCase('tr-TR'), 800, 940, 130);
  ctx.fillText(text.toLocaleUpperCase('tr-TR'), 512, 136);
  return toTexture(c);
}

/** Basit yazı dokusu (kasa numarası, ekranlar). */
export function makeTextTexture(text: string, bg: string, fg: string, w = 512, h = 256): THREE.CanvasTexture {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, text, 800, w * 0.9, h * 0.6);
  ctx.fillText(text, w / 2, h / 2);
  return toTexture(c);
}

/** Delikli arka panel (pegboard) dokusu. */
export function makePegboardTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = '#d9dcdf';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#9aa0a6';
  for (let y = 8; y < 128; y += 32) for (let x = 8; x < 128; x += 32) ctx.fillRect(x, y, 6, 6);
  return toTexture(c, { repeat: [1, 1] });
}
