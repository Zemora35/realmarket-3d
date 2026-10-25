import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeCeilingTexture, makeFloorTextures, makeSignTexture } from '@realmarket/engine-3d';
import type { SceneData } from '@realmarket/shared';
import { sfx } from '../audio';
import { runtime } from '../world/runtime';
import type { SignPart } from '../world/fixtures';

/** Zemin, tavan, duvarlar, vitrin camı, otomatik kapılar ve aydınlatma armatürleri. */
export function StoreShell({ scene }: { scene: SceneData }) {
  const { widthM: W, lengthM: L, ceilingHeightM: H } = scene.layout.params;
  const floor = useMemo(() => {
    const t = makeFloorTextures();
    // 4×4 karo = 2.4 m
    t.map.repeat.set(W / 2.4, L / 2.4);
    t.rough.repeat.set(W / 2.4, L / 2.4);
    return t;
  }, [W, L]);
  const ceiling = useMemo(() => {
    const t = makeCeilingTexture();
    t.repeat.set(W / 0.6, L / 0.6);
    return t;
  }, [W, L]);
  useEffect(
    () => () => {
      floor.map.dispose();
      floor.rough.dispose();
      ceiling.dispose();
    },
    [floor, ceiling],
  );

  const walls = scene.layout.objects.filter((o) => o.type === 'wall');
  const doors = scene.layout.objects.filter((o) => o.type === 'door');

  // tavan LED panelleri (koridorlar boyunca)
  const ledMatrices = useMemo(() => {
    const list: THREE.Matrix4[] = [];
    for (let x = 2; x < W - 1; x += 3.2) {
      for (let z = 2; z < L - 1; z += 2.4) {
        list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, H - 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1.2, 0.3, 1)));
      }
    }
    return list;
  }, [W, L, H]);
  const ledRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ledRef.current;
    if (!m) return;
    ledMatrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
  }, [ledMatrices]);

  return (
    <group>
      {/* Mağaza zemini */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0, L / 2]} receiveShadow>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={floor.map} roughnessMap={floor.rough} roughness={0.55} metalness={0.02} envMapIntensity={0.9} />
      </mesh>
      {/* Dış alan (otopark) */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.01, -20]}>
        <planeGeometry args={[W + 80, 40]} />
        <meshStandardMaterial color="#5b5f63" roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, 0.005, -2.2]}>
        <planeGeometry args={[W + 0.4, 4.4]} />
        <meshStandardMaterial color="#9a9c9e" roughness={0.9} />
      </mesh>
      {/* Tavan */}
      <mesh rotation-x={Math.PI / 2} position={[W / 2, H, L / 2]}>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial map={ceiling} roughness={0.9} />
      </mesh>
      <instancedMesh ref={ledRef} args={[undefined, undefined, ledMatrices.length]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
      {/* Duvarlar: ön cephe cam vitrin, diğerleri boyalı */}
      {walls.map((w) =>
        w.id.startsWith('wall-front') ? (
          <group key={w.id} position={[w.position.x, 0, w.position.z]}>
            <mesh position={[0, 1.4, 0]}>
              <boxGeometry args={[w.size.x, 2.8, 0.03]} />
              <meshStandardMaterial color="#cfe8ff" transparent opacity={0.16} roughness={0.03} metalness={0.2} depthWrite={false} />
            </mesh>
            <mesh position={[0, (2.8 + H) / 2, 0]}>
              <boxGeometry args={[w.size.x, H - 2.8, w.size.z]} />
              <meshStandardMaterial color="#2c3e50" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[w.size.x, 0.1, w.size.z]} />
              <meshStandardMaterial color="#3a3f44" roughness={0.6} metalness={0.4} />
            </mesh>
            {Array.from({ length: Math.max(1, Math.round(w.size.x / 2)) + 1 }, (_, i) => (
              <mesh key={i} position={[-w.size.x / 2 + (i * w.size.x) / Math.max(1, Math.round(w.size.x / 2)), 1.4, 0]}>
                <boxGeometry args={[0.06, 2.8, 0.08]} />
                <meshStandardMaterial color="#3a3f44" roughness={0.5} metalness={0.6} />
              </mesh>
            ))}
          </group>
        ) : (
          <group key={w.id}>
            <mesh position={[w.position.x, w.size.y / 2, w.position.z]} receiveShadow>
              <boxGeometry args={[w.size.x, w.size.y, w.size.z]} />
              <meshStandardMaterial color="#f1ede6" roughness={0.85} />
            </mesh>
            <mesh position={[w.position.x, 0.6, w.position.z]}>
              <boxGeometry args={[w.size.x + 0.02, 1.2, w.size.z + 0.02]} />
              <meshStandardMaterial color="#d8d2c6" roughness={0.7} />
            </mesh>
          </group>
        ),
      )}
      {doors.map((d) => (
        <AutoDoor key={d.id} x={d.position.x} width={d.size.x} height={d.size.y} label={String(d.meta?.label ?? '')} ceiling={H} />
      ))}
    </group>
  );
}

/** Algılayıcılı kayar cam kapı: oyuncu veya araba yaklaşınca açılır. */
function AutoDoor({ x, width, height, label, ceiling }: { x: number; width: number; height: number; label: string; ceiling: number }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  const open = useRef(0);
  const wasOpen = useRef(false);
  const signTex = useMemo(() => makeSignTexture(label, label === 'GİRİŞ' ? '#15803d' : '#b91c1c'), [label]);
  useFrame((_, dt) => {
    const near = (p: THREE.Vector3) => Math.abs(p.x - x) < width / 2 + 1.2 && p.z < 3.2 && p.z > -3;
    const target = near(runtime.playerPos) || near(runtime.cartPos) ? 1 : 0;
    if (target === 1 && !wasOpen.current) sfx.door();
    wasOpen.current = target === 1;
    open.current += (target - open.current) * Math.min(1, dt * 4);
    const slide = (width / 2) * 0.95 * open.current;
    if (left.current) left.current.position.x = -width / 4 - slide;
    if (right.current) right.current.position.x = width / 4 + slide;
  });
  return (
    <group position={[x, 0, 0]}>
      <mesh ref={left} position={[-width / 4, height / 2, 0.05]}>
        <boxGeometry args={[width / 2, height, 0.03]} />
        <meshStandardMaterial color="#d6efff" transparent opacity={0.22} roughness={0.03} metalness={0.2} depthWrite={false} />
      </mesh>
      <mesh ref={right} position={[width / 4, height / 2, 0.05]}>
        <boxGeometry args={[width / 2, height, 0.03]} />
        <meshStandardMaterial color="#d6efff" transparent opacity={0.22} roughness={0.03} metalness={0.2} depthWrite={false} />
      </mesh>
      <mesh position={[0, height + 0.15, 0]}>
        <boxGeometry args={[width + 0.2, 0.3, 0.25]} />
        <meshStandardMaterial color="#3a3f44" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, (height + 0.3 + ceiling) / 2, 0]}>
        <boxGeometry args={[width + 0.2, ceiling - height - 0.3, 0.2]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.6} />
      </mesh>
      <mesh position={[0, height + 0.15, 0.13]}>
        <planeGeometry args={[1.1, 0.27]} />
        <meshBasicMaterial map={signTex} toneMapped={false} />
      </mesh>
      <mesh position={[0, height + 0.15, -0.13]} rotation-y={Math.PI}>
        <planeGeometry args={[1.1, 0.27]} />
        <meshBasicMaterial map={signTex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Asılı reyon tabelaları ve kasa numaraları. */
export function Signs({ signs, ceiling }: { signs: SignPart[]; ceiling: number }) {
  const textures = useMemo(() => new Map(signs.map((s) => [s.id, makeSignTexture(s.text, s.color)])), [signs]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  return (
    <group>
      {signs.map((s) => (
        <group key={s.id} position={s.pos} rotation-y={s.rotY}>
          {/* çift taraflı tabelada iki ayrı yüz: arka yazı ayna görüntüsü olmaz */}
          {(s.doubleSided ? [0, Math.PI] : [0]).map((r) => (
            <mesh key={r} rotation-y={r} position-z={r ? -0.004 : 0.004}>
              <planeGeometry args={s.size} />
              <meshStandardMaterial map={textures.get(s.id)} emissive="#ffffff" emissiveMap={textures.get(s.id)} emissiveIntensity={0.35} roughness={0.6} />
            </mesh>
          ))}
          {s.hanging &&
            [-1, 1].map((k) => (
              <mesh key={k} position={[(k * s.size[0]) / 2.4, (ceiling - s.pos[1] + s.size[1] / 2) / 2, 0]}>
                <cylinderGeometry args={[0.004, 0.004, ceiling - s.pos[1] - s.size[1] / 2, 4]} />
                <meshStandardMaterial color="#555" />
              </mesh>
            ))}
        </group>
      ))}
    </group>
  );
}
