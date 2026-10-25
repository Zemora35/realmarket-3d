import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getProductGeometry, getProductMaterials } from '@realmarket/engine-3d';
import { computePlacements, expandSlotUnits } from '@realmarket/planogram';
import type { Planogram, SceneProduct } from '@realmarket/shared';

function Studio() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 3, 2]} intensity={1.6} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 3, 2]} scale={[4, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[-3, 1, 0]} rotation-y={Math.PI / 2} scale={[4, 2, 1]} />
      </Environment>
    </>
  );
}

/** Tek ürünün parametrik 3D modeli (döndürülebilir). Ölçü/ambalaj değişince yeniden üretilir. */
export function ProductPreview({ product }: { product: SceneProduct }) {
  const d = product.dimensions;
  const h = (d?.heightMm ?? 200) / 1000;
  const size = Math.max(d?.widthMm ?? 100, d?.heightMm ?? 200, d?.depthMm ?? 100) / 1000;
  const geometry = useMemo(() => getProductGeometry(product, 'high'), [product]);
  const materials = useMemo(() => getProductMaterials(product), [product]);
  const tris = (geometry.index?.count ?? 0) / 3;
  return (
    <div className="relative h-72 overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-slate-300">
      <Canvas camera={{ position: [size * 1.4, h * 0.8, size * 2.2], fov: 35, near: 0.005, far: 20 }} dpr={[1, 2]}>
        <Studio />
        <mesh geometry={geometry} material={materials} position={[0, -h / 2, 0]} />
        <OrbitControls autoRotate autoRotateSpeed={1.2} enablePan={false} minDistance={size * 0.6} maxDistance={size * 6} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-2 text-[11px] text-slate-600">
        {tris.toLocaleString('tr-TR')} üçgen · {d ? `${d.widthMm}×${d.heightMm}×${d.depthMm} mm` : 'ölçü yok'}
      </div>
    </div>
  );
}

const boardGeo = new THREE.BoxGeometry(1, 1, 1);
const boardMat = new THREE.MeshStandardMaterial({ color: '#dfe3e7', metalness: 0.5, roughness: 0.4 });

function SlotUnits({ product, matrices }: { product: SceneProduct; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => getProductGeometry(product, 'low'), [product]);
  const materials = useMemo(() => getProductMaterials(product), [product]);
  useEffect(() => {
    const m = ref.current!;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.count = matrices.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[geometry, materials, Math.max(1, matrices.length)]} />;
}

/** Planogramın canlı 3D raf önizlemesi (istemcide hesaplanır, kaydetmeden önce). */
export function ShelfPreview({ planogram, products }: { planogram: Planogram; products: SceneProduct[] }) {
  const byGtin = useMemo(() => new Map(products.map((p) => [p.gtin, p])), [products]);
  const { fixture } = planogram;
  const W = fixture.widthMm / 1000;
  const D = fixture.depthMm / 1000;
  const H = fixture.heightMm / 1000;
  const groups = useMemo(() => {
    const res = computePlacements(planogram, (g) => {
      const p = byGtin.get(g);
      return p?.dimensions ?? null;
    });
    const out = new Map<string, THREE.Matrix4[]>();
    for (const slot of res.slots) {
      const units = expandSlotUnits(slot, W, D).slice(0, slot.facings * slot.stackCount * 2);
      const list = out.get(slot.gtin) ?? [];
      for (const u of units) list.push(new THREE.Matrix4().makeTranslation(u.x, u.y, u.z));
      out.set(slot.gtin, list);
    }
    return [...out.entries()];
  }, [planogram, byGtin, W, D]);
  return (
    <div className="h-80 overflow-hidden rounded-xl bg-gradient-to-b from-slate-100 to-slate-300">
      <Canvas camera={{ position: [0, H * 0.6, Math.max(W, H) * 1.25], fov: 40, near: 0.01, far: 50 }} dpr={[1, 2]}>
        <Studio />
        <group position={[0, -H / 2, 0]}>
          <mesh geometry={boardGeo} material={boardMat} position={[0, H / 2, -D / 2 - 0.02]} scale={[W, H, 0.03]} />
          {fixture.levels.map((l) => {
            const depth = (l.depthMm ?? fixture.depthMm) / 1000;
            const z = D / 2 - (l.zOffsetMm ?? 0) / 1000 - depth / 2;
            return <mesh key={l.index} geometry={boardGeo} material={boardMat} position={[0, l.heightFromBaseMm / 1000 - 0.0125, z]} scale={[W, 0.025, depth]} />;
          })}
          {groups.map(([gtin, matrices]) => {
            const p = byGtin.get(gtin);
            return p ? <SlotUnits key={gtin} product={p} matrices={matrices} /> : null;
          })}
        </group>
        <OrbitControls target={[0, 0, 0]} enablePan />
      </Canvas>
    </div>
  );
}
