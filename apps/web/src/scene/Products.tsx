import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getProductGeometry, getProductMaterials } from '@realmarket/engine-3d';
import type { SceneData } from '@realmarket/shared';
import type { Quality } from '../state/game';
import { registry } from '../world/units';

const LOD_NEAR: Record<Quality, number> = { low: 3.5, medium: 6.5, high: 11 };

interface Chunk {
  units: number[];
  hi: THREE.InstancedMesh;
  lo: THREE.InstancedMesh;
}

/**
 * Raf ürünleri: (ürün × reyon) başına iki InstancedMesh (yakın: yüksek detay, uzak: düşük detay).
 * Aynı ürünün tüm kopyaları tek geometri ve malzeme setini paylaşır; reyon parçalama
 * sayesinde görüş alanı dışındaki reyonlar çizilmez (frustum culling).
 */
export function Products({ scene, quality }: { scene: SceneData; quality: Quality }) {
  const group = useRef<THREE.Group>(null);
  const dirty = useRef(true);
  const lastUpdate = useRef(0);
  const lastCam = useRef(new THREE.Vector3(1e9, 0, 0));

  const chunks = useMemo<Chunk[]>(() => {
    const byKey = new Map<string, number[]>();
    for (const u of registry.units) {
      const k = `${u.productId}|${u.departmentCode}`;
      const list = byKey.get(k);
      if (list) list.push(u.idx);
      else byKey.set(k, [u.idx]);
    }
    const out: Chunk[] = [];
    for (const [k, units] of byKey) {
      const product = registry.products.get(k.split('|')[0])!;
      const materials = getProductMaterials(product);
      const make = (detail: 'high' | 'low') => {
        const m = new THREE.InstancedMesh(getProductGeometry(product, detail), materials, units.length);
        m.count = 0;
        m.castShadow = false;
        m.receiveShadow = false;
        // reyonun tamamını kapsayan sabit sınır küresi (birimler hareket etmez)
        const box = new THREE.Box3();
        for (const i of units) {
          const u = registry.units[i];
          box.expandByPoint(new THREE.Vector3(u.pos.x - u.half.x, u.pos.y, u.pos.z - u.half.z));
          box.expandByPoint(new THREE.Vector3(u.pos.x + u.half.x, u.pos.y + u.half.y * 2, u.pos.z + u.half.z));
        }
        m.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        m.boundingBox = box;
        return m;
      };
      out.push({ units, hi: make('high'), lo: make('low') });
    }
    return out;
    // registry sahne değişince yeniden kurulur; scene bağımlılığı bu yüzden bilinçli
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    const g = group.current!;
    for (const c of chunks) g.add(c.hi, c.lo);
    dirty.current = true;
    const unsub = registry.subscribe(() => (dirty.current = true));
    return () => {
      unsub();
      for (const c of chunks) {
        g.remove(c.hi, c.lo);
        c.hi.dispose();
        c.lo.dispose();
      }
    };
  }, [chunks]);

  useEffect(() => {
    dirty.current = true;
  }, [quality]);

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    const moved = camera.position.distanceToSquared(lastCam.current) > 0.25;
    if (!dirty.current && !(moved && t - lastUpdate.current > 0.2)) return;
    lastUpdate.current = t;
    lastCam.current.copy(camera.position);
    dirty.current = false;
    const near2 = LOD_NEAR[quality] ** 2;
    const cx = camera.position.x;
    const cz = camera.position.z;
    for (const c of chunks) {
      let nh = 0;
      let nl = 0;
      const ha = c.hi.instanceMatrix.array as Float32Array;
      const la = c.lo.instanceMatrix.array as Float32Array;
      for (const i of c.units) {
        const u = registry.units[i];
        if (u.taken) continue;
        // ucuz örtme: kamera rafın arka panelinin arkasındaysa bu ürünler görünmez
        if (u.normal && (cx - u.planeX) * u.normal.x + (cz - u.planeZ) * u.normal.z < -0.05) continue;
        const dx = u.pos.x - cx;
        const dz = u.pos.z - cz;
        if (dx * dx + dz * dz < near2) ha.set(u.matrix.elements, nh++ * 16);
        else la.set(u.matrix.elements, nl++ * 16);
      }
      c.hi.count = nh;
      c.lo.count = nl;
      c.hi.instanceMatrix.needsUpdate = true;
      c.lo.instanceMatrix.needsUpdate = true;
    }
  });

  return <group ref={group} />;
}
