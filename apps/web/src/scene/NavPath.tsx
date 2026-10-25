import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec2 } from '@realmarket/shared';
import { useGame } from '../state/game';
import { runtime } from '../world/runtime';
import { registry } from '../world/units';

const SPACING = 0.55;
const MAX_ARROWS = 400;

function chevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.16, -0.1);
  shape.lineTo(0, 0.08);
  shape.lineTo(0.16, -0.1);
  shape.lineTo(0.16, -0.02);
  shape.lineTo(0, 0.16);
  shape.lineTo(-0.16, -0.02);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Zeminde akan ışıklı ok rotası + hedef raf işaretçileri (A* yolundan). */
export function NavPath() {
  const nav = useGame((s) => s.nav);
  const arrows = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => chevronGeometry(), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }), []);
  const markers = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  // polyline örnekleme tablosu
  const samples = useMemo(() => {
    const path = nav.path;
    if (!path || path.length < 2) return null;
    const seg: { a: Vec2; b: Vec2; len: number; start: number }[] = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const len = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      seg.push({ a: path[i - 1], b: path[i], len, start: total });
      total += len;
    }
    return { seg, total };
  }, [nav.path]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const m = arrows.current;
    if (m) {
      if (!samples) m.count = 0;
      else {
        const phase = (clock.elapsedTime * 0.9) % SPACING;
        let n = 0;
        let si = 0;
        for (let d = phase; d < samples.total && n < MAX_ARROWS; d += SPACING) {
          while (si < samples.seg.length - 1 && d > samples.seg[si].start + samples.seg[si].len) si++;
          const s = samples.seg[si];
          const t = (d - s.start) / (s.len || 1);
          tmp.position.set(s.a.x + (s.b.x - s.a.x) * t, 0.012, s.a.z + (s.b.z - s.a.z) * t);
          tmp.rotation.set(0, Math.atan2(-(s.b.x - s.a.x), -(s.b.z - s.a.z)), 0);
          // oyuncuya yakın oklar hafif soluk
          const near = Math.hypot(tmp.position.x - runtime.playerPos.x, tmp.position.z - runtime.playerPos.z);
          tmp.scale.setScalar(near < 0.6 ? 0.6 : 1);
          tmp.updateMatrix();
          m.setMatrixAt(n++, tmp.matrix);
        }
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
    }
    // hedef işaretçileri
    const g = markers.current;
    if (g) {
      g.children.forEach((child, i) => {
        child.position.y = (child.userData.baseY as number) + Math.sin(clock.elapsedTime * 3 + i) * 0.05;
        child.rotation.y += 0.03;
      });
    }
    // varış kontrolü
    const first = nav.targets[0];
    if (first && Math.hypot(runtime.playerPos.x - first.point.x, runtime.playerPos.z - first.point.z) < 1.3) {
      const st = useGame.getState();
      const name = registry.products.get(first.productId)?.name;
      const rest = nav.targets.slice(1);
      useGame.setState({ nav: { targets: rest, path: null } });
      // ürünsüz hedef = kasa rotası
      st.toast(name ? `${name} burada — nişangâhı ürüne çevirip E ile alın` : 'Kasaya ulaştınız — ödemeye geçebilirsiniz', 'success');
      if (rest.length) useGame.getState().refreshRoute();
    }
  });

  return (
    <group>
      <instancedMesh ref={arrows} args={[geometry, material, MAX_ARROWS]} frustumCulled={false} renderOrder={1} />
      <group ref={markers}>
        {nav.targets.map((t, i) => {
          const u = registry.units[t.unitIdx];
          const y = (u?.pos.y ?? 1) + (u?.half.y ?? 0.1) * 2 + 0.25;
          return (
            <mesh key={`${t.productId}-${i}`} position={[u?.pos.x ?? t.point.x, y, u?.pos.z ?? t.point.z]} rotation-x={Math.PI} userData={{ baseY: y }}>
              <coneGeometry args={[0.07, 0.16, 12]} />
              <meshBasicMaterial color={i === 0 ? '#22d3ee' : '#a78bfa'} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
