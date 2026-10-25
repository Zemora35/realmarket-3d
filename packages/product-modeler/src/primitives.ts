import * as THREE from 'three';

/** Süperelips kesitli dönel yüzey halkası. a: x yarı genişliği, b: z yarı derinliği. */
export interface Ring {
  y: number;
  a: number;
  b?: number;
  /** Süperelips üssü (2 = elips, büyüdükçe yuvarlatılmış dikdörtgen). */
  n?: number;
  cx?: number;
  cz?: number;
}

export interface RingOptions {
  segments: number;
  /** Kesit dilim sayısı (domates gibi loblu meyveler). */
  lobes?: number;
  lobeAmp?: number;
}

function sePoint(theta: number, a: number, b: number, n: number) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / n;
  return { x: a * Math.sign(s) * Math.abs(s) ** e, z: b * Math.sign(c) * Math.abs(c) ** e };
}

/**
 * Halka profilinden indeksli yüzey üretir. UV: u çevre boyunca (u=0.5 ön yüz, +z),
 * v halkalar boyunca 0→1 (etiket bandı tam doku yüksekliğini kullanır).
 */
export function ringBody(rings: Ring[], opts: RingOptions): THREE.BufferGeometry {
  const S = opts.segments;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // v: profil boyunca yay uzunluğu (geri dönen profillerde de 0–1 aralığında kalır)
  const arc = [0];
  for (let k = 1; k < rings.length; k++) {
    arc.push(arc[k - 1] + Math.hypot(rings[k].y - rings[k - 1].y, rings[k].a - rings[k - 1].a));
  }
  const total = arc[arc.length - 1];
  rings.forEach((r, k) => {
    const v = total > 1e-9 ? arc[k] / total : k / Math.max(1, rings.length - 1);
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      const theta = Math.PI + u * Math.PI * 2;
      const lobe = opts.lobes ? 1 + (opts.lobeAmp ?? 0.05) * Math.cos(opts.lobes * theta) : 1;
      const p = sePoint(theta, r.a * lobe, (r.b ?? r.a) * lobe, r.n ?? 2);
      positions.push(p.x + (r.cx ?? 0), r.y, p.z + (r.cz ?? 0));
      uvs.push(u, v);
    }
  });
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < S; i++) {
      const a = k * (S + 1) + i;
      const b = a + 1;
      const c = a + S + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Halkayı kapatan yatay disk (yukarı ya da aşağı bakan). */
export function disc(ring: Ring, segments: number, up: boolean): THREE.BufferGeometry {
  const positions: number[] = [ring.cx ?? 0, ring.y, ring.cz ?? 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  const a = ring.a;
  const b = ring.b ?? ring.a;
  for (let i = 0; i <= segments; i++) {
    const theta = Math.PI + (i / segments) * Math.PI * 2;
    const p = sePoint(theta, a, b, ring.n ?? 2);
    positions.push(p.x + (ring.cx ?? 0), ring.y, p.z + (ring.cz ?? 0));
    uvs.push(0.5 + p.x / (2 * a || 1), 0.5 + p.z / (2 * b || 1));
  }
  for (let i = 1; i <= segments; i++) {
    if (up) indices.push(0, i, i + 1);
    else indices.push(0, i + 1, i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Ön/arka yüzü şişkin "yastık" yüzeyi (cips poşeti, makarna paketi, poşet). */
export function pillow(args: {
  w: number;
  h: number;
  d: number;
  nx: number;
  ny: number;
  seal: number;
  pu: number;
  pv: number;
  /** true: taban körüklü (ayakta duran poşet), tabanda şişkinlik 1. */
  gusset?: boolean;
}): { surfaces: THREE.BufferGeometry[]; bottom: THREE.BufferGeometry | null } {
  const { w, h, d, nx, ny, seal, pu, pv } = args;
  const bulge = (u: number, v: number) => {
    const bu = Math.sin(Math.PI * u) ** pu;
    let bv: number;
    if (args.gusset) {
      // tabanda tam derinlik, üst kaynak dikişine doğru yumuşakça incelir
      bv = v > 1 - seal ? 0 : (1 - (v / (1 - seal)) ** 2) ** pv;
    } else {
      bv = v < seal || v > 1 - seal ? 0 : Math.sin((Math.PI * (v - seal)) / (1 - 2 * seal)) ** pv;
    }
    return bu * Math.min(1, bv);
  };
  const surfaces: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= ny; j++) {
      const v = j / ny;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        positions.push(-w / 2 + u * w, v * h, side * (d / 2) * bulge(u, v));
        // arka yüz de ön görseli (aynalanmadan okunur) kullanır
        uvs.push(side === 1 ? u * 0.5 : (1 - u) * 0.5, v);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const dd = a + nx + 1;
        const c = dd + 1;
        if (side === 1) indices.push(a, b, dd, b, c, dd);
        else indices.push(a, dd, b, b, dd, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    surfaces.push(g);
  }
  let bottom: THREE.BufferGeometry | null = null;
  if (args.gusset) {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const z = (d / 2) * bulge(u, 0);
      positions.push(-w / 2 + u * w, 0, z, -w / 2 + u * w, 0, -z);
      uvs.push(u, 0, u, 1);
    }
    for (let i = 0; i < nx; i++) {
      const f0 = i * 2;
      const b0 = f0 + 1;
      const f1 = f0 + 2;
      const b1 = f0 + 3;
      indices.push(f0, b0, f1, f1, b0, b1);
    }
    bottom = new THREE.BufferGeometry();
    bottom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bottom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bottom.setIndex(indices);
    bottom.computeVertexNormals();
  }
  return { surfaces, bottom };
}

/** Etiket atlası bölgeleri (u ekseni): ön 0–0.5, yan 0.5–0.75, üst 0.75–1. */
export const ATLAS = {
  front: [0, 0.5],
  side: [0.5, 0.75],
  top: [0.75, 1],
} as const;

/** Kutunun yüz UV'lerini etiket atlasına göre yeniden eşler. */
export function atlasBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry yüz sırası: +x, -x, +y, -y, +z, -z (her biri 4 köşe)
  const regions = [ATLAS.side, ATLAS.side, ATLAS.top, ATLAS.top, ATLAS.front, ATLAS.front];
  for (let f = 0; f < 6; f++) {
    const [u0, u1] = regions[f];
    for (let k = 0; k < 4; k++) {
      const idx = f * 4 + k;
      uv.setX(idx, u0 + uv.getX(idx) * (u1 - u0));
    }
  }
  uv.needsUpdate = true;
  g.translate(0, h / 2, 0);
  return g;
}

/** Elle tanımlı düz yüzlü parça (ör. süt kutusu çatısı). quads: 4 köşe, saat yönü tersine (dışarıdan). */
export function flatFaces(polys: [number, number, number][][], uvRegion: readonly [number, number]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const poly of polys) {
    const base = positions.length / 3;
    poly.forEach((p, i) => {
      positions.push(...p);
      const t = poly.length === 3 ? [[0, 0], [1, 0], [0.5, 1]][i] : [[0, 0], [1, 0], [1, 1], [0, 1]][i];
      uvs.push(uvRegion[0] + t[0] * (uvRegion[1] - uvRegion[0]), t[1]);
    });
    for (let i = 1; i < poly.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
