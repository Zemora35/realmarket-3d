import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getProductGeometry, getProductMaterials } from '@realmarket/engine-3d';
import { useGame } from '../state/game';
import { HAND_OFFSET, INSPECT_OFFSET, runtime } from '../world/runtime';
import { registry } from '../world/units';

const PICK_TIME = 0.28;
const RETURN_TIME = 0.32;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Elde tutulan / incelenen ürün. İnceleme modunda sürükleyerek 360° döndürülür. */
export function HeldItem() {
  const held = useGame((s) => s.held);
  const { camera, gl } = useThree();
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Mesh>(null);
  const product = held ? registry.products.get(held.productId) : undefined;
  const height = (product?.dimensions?.heightMm ?? 200) / 1000;
  const geometry = useMemo(() => (product ? getProductGeometry(product, 'high') : null), [product]);

  // inceleme: sürükleyerek döndür, tekerlekle yakınlaştır (fare ve dokunmatik)
  useEffect(() => {
    if (held?.mode !== 'inspect') return;
    const el = gl.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      runtime.held.spinY += (e.clientX - lx) * 0.012;
      runtime.held.spinX += (e.clientY - ly) * 0.012;
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = () => (dragging = false);
    const wheel = (e: WheelEvent) => {
      runtime.held.zoom = Math.max(-0.12, Math.min(0.2, runtime.held.zoom + e.deltaY * 0.0004));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('wheel', wheel, { passive: true });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [held?.mode, gl]);

  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), spin: new THREE.Quaternion(), e: new THREE.Euler() }), []);

  useFrame(() => {
    const g = outer.current;
    if (!g || !held) return;
    const st = runtime.held;
    const now = performance.now();
    const inspect = held.mode === 'inspect';
    // hedef poz: kameranın önünde
    const offset = inspect ? INSPECT_OFFSET.clone().setZ(INSPECT_OFFSET.z - Math.max(height, 0.12) * 0.6 - st.zoom) : HAND_OFFSET;
    tmp.pos.copy(offset).applyQuaternion(camera.quaternion).add(camera.position);
    tmp.spin.setFromEuler(tmp.e.set(inspect ? st.spinX : 0.05, inspect ? st.spinY : -0.35, 0, 'XYZ'));
    tmp.quat.copy(camera.quaternion).multiply(tmp.spin);
    if (inner.current) inner.current.position.y = -height / 2;

    if (st.kind === 'pick') {
      const t = Math.min(1, (now - st.start) / 1000 / PICK_TIME);
      const e = ease(t);
      const from = st.from.clone().add(new THREE.Vector3(0, height / 2, 0));
      g.position.lerpVectors(from, tmp.pos, e);
      g.quaternion.slerpQuaternions(st.fromQuat, tmp.quat, e);
      if (t >= 1) st.kind = 'idle';
    } else if (st.kind === 'toShelf') {
      const u = registry.units[held.unitIdx];
      const t = Math.min(1, (now - st.start) / 1000 / RETURN_TIME);
      const e = ease(t);
      const to = u.pos.clone().add(new THREE.Vector3(0, height / 2, 0));
      g.position.lerpVectors(st.from, to, e);
      g.quaternion.slerpQuaternions(st.fromQuat, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), u.yaw), e);
      if (t >= 1) {
        useGame.getState().finishReturn();
        return;
      }
    } else {
      g.position.lerp(tmp.pos, 0.5);
      g.quaternion.slerp(tmp.quat, 0.5);
    }
    // arabaya uçuş animasyonu bu konumdan başlar
    st.worldPos.copy(g.position).sub(new THREE.Vector3(0, height / 2, 0).applyQuaternion(g.quaternion));
    st.worldQuat.copy(g.quaternion);
  });

  if (!held || !product || !geometry) return null;
  return (
    <group ref={outer}>
      <mesh ref={inner} geometry={geometry} material={getProductMaterials(product)} />
      {held.mode === 'inspect' && <pointLight position={[0.3, 0.3, 0.4]} intensity={0.6} distance={2} />}
    </group>
  );
}
