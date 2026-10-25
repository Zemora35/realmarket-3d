import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCartFrameGeometry, buildWheelGeometry, CART_DIMENSIONS, createFixtureMaterials, getPriceTagTexture } from '@realmarket/engine-3d';
import type { SceneData } from '@realmarket/shared';
import { boxMatrix, buildFixtureParts, type CoolerDoor, type MatKey } from '../world/fixtures';
import { runtime } from '../world/runtime';
import { Signs } from './StoreShell';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const tagGeo = new THREE.PlaneGeometry(0.1, 0.05);

/** Tüm raf/soğutucu/kasa parçaları: malzeme başına tek InstancedMesh. */
export function Fixtures({ scene, shadows }: { scene: SceneData; shadows: boolean }) {
  const parts = useMemo(() => buildFixtureParts(scene), [scene]);
  const materials = useMemo(() => createFixtureMaterials(), []);
  const groups = useMemo(() => {
    const byMat = new Map<MatKey, THREE.Matrix4[]>();
    for (const b of parts.boxes) byMat.set(b.mat, [...(byMat.get(b.mat) ?? []), boxMatrix(b)]);
    return [...byMat.entries()];
  }, [parts]);
  const tagsByProduct = useMemo(() => {
    const m = new Map<string, THREE.Matrix4[]>();
    for (const t of parts.priceTags) {
      const mat = new THREE.Matrix4().compose(new THREE.Vector3(...t.pos), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rotY), new THREE.Vector3(1, 1, 1));
      m.set(t.productId, [...(m.get(t.productId) ?? []), mat]);
    }
    return [...m.entries()];
  }, [parts]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  return (
    <group>
      {groups.map(([mat, matrices]) => (
        <InstancedBoxes key={mat} matrices={matrices} material={materials[mat]} shadows={shadows && mat !== 'glass' && mat !== 'lightStrip'} />
      ))}
      {tagsByProduct.map(([productId, matrices]) => (
        <PriceTags key={productId} scene={scene} productId={productId} matrices={matrices} />
      ))}
      <CoolerDoors doors={parts.coolerDoors} glass={materials.glass} frame={materials.darkSteel} />
      <Signs signs={parts.signs} ceiling={scene.layout.params.ceilingHeightM} />
      <StaticCarts carts={parts.staticCarts} />
    </group>
  );
}

function InstancedBoxes({ matrices, material, shadows }: { matrices: THREE.Matrix4[]; material: THREE.Material; shadows: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current!;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  return <instancedMesh ref={ref} args={[unitBox, material, matrices.length]} castShadow={shadows} receiveShadow={shadows} />;
}

function PriceTags({ scene, productId, matrices }: { scene: SceneData; productId: string; matrices: THREE.Matrix4[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const product = scene.products.find((p) => p.id === productId)!;
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: getPriceTagTexture(product), roughness: 0.6 }), [product]);
  useEffect(() => {
    const m = ref.current!;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices]);
  useEffect(() => () => material.dispose(), [material]);
  return <instancedMesh ref={ref} args={[tagGeo, material, matrices.length]} />;
}

/** Cam kapılı soğutucular: oyuncu kapının önüne gelince kapı açılır. */
function CoolerDoors({ doors, glass, frame }: { doors: CoolerDoor[]; glass: THREE.Material; frame: THREE.Material }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const angles = useRef<number[]>(doors.map(() => 0));
  useFrame((_, dt) => {
    doors.forEach((d, i) => {
      const g = refs.current[i];
      if (!g) return;
      // kapının önündeki nokta (menteşeden genişliğin yarısı kadar, 0.7 m önde)
      const c = Math.cos(d.rotY);
      const s = Math.sin(d.rotY);
      const fx = d.hinge[0] + (d.width / 2) * c + 0.7 * s;
      const fz = d.hinge[2] - (d.width / 2) * s + 0.7 * c;
      const near = Math.hypot(runtime.playerPos.x - fx, runtime.playerPos.z - fz) < 1.0;
      const target = near ? -1.25 : 0;
      angles.current[i] += (target - angles.current[i]) * Math.min(1, dt * 5);
      g.rotation.y = d.rotY + angles.current[i];
    });
  });
  return (
    <group>
      {doors.map((d, i) => (
        <group key={d.id} ref={(el) => (refs.current[i] = el)} position={d.hinge} rotation-y={d.rotY}>
          <mesh position={[d.width / 2, d.height / 2, 0]} material={glass}>
            <boxGeometry args={[d.width - 0.06, d.height - 0.06, 0.012]} />
          </mesh>
          {[
            [d.width / 2, 0.015, d.width, 0.03],
            [d.width / 2, d.height - 0.015, d.width, 0.03],
            [0.015, d.height / 2, 0.03, d.height],
            [d.width - 0.015, d.height / 2, 0.03, d.height],
          ].map(([x, y, w, h], k) => (
            <mesh key={k} position={[x, y, 0]} material={frame}>
              <boxGeometry args={[w, h, 0.03]} />
            </mesh>
          ))}
          <mesh position={[d.width - 0.06, d.height / 2, 0.03]} material={frame}>
            <boxGeometry args={[0.025, 0.6, 0.025]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const cartGeo = buildCartFrameGeometry();
const wheelGeo = buildWheelGeometry();
export const cartMaterials = {
  frame: new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.85, roughness: 0.28 }),
  grip: new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.5 }),
  wheel: new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.7 }),
};

/** Araba alanındaki dekoratif arabalar. */
function StaticCarts({ carts }: { carts: { pos: [number, number, number]; rotY: number }[] }) {
  return (
    <group>
      {carts.map((c, i) => (
        <group key={i} position={c.pos} rotation-y={c.rotY}>
          <CartBody />
        </group>
      ))}
    </group>
  );
}

/** Araba gövdesi (tel sepet, kol, tekerlekler). */
export function CartBody({ wheelRefs }: { wheelRefs?: React.RefObject<(THREE.Mesh | null)[]> }) {
  return (
    <group>
      <mesh geometry={cartGeo.frame} material={cartMaterials.frame} castShadow />
      <mesh geometry={cartGeo.grip} material={cartMaterials.grip} />
      {CART_DIMENSIONS.wheelPositions.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (wheelRefs?.current) wheelRefs.current[i] = el;
          }}
          geometry={wheelGeo}
          material={cartMaterials.wheel}
          position={[x, CART_DIMENSIONS.wheelRadius, z]}
        />
      ))}
    </group>
  );
}
