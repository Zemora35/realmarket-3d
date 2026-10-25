import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from '../state/game';
import { input, movementAxes } from '../world/input';
import { CART_HALF, CART_OFFSET, physicsRefs } from '../world/physics-refs';
import { runtime } from '../world/runtime';

const EYE_HEIGHT = 1.62;
const WALK = 1.45;
const RUN = 2.6;
const CART_TURN_RATE = 2.6;

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Birinci şahıs oyuncu: Rapier kinematik karakter denetleyicisi ile duvar/raf çarpışması.
 * Araba tutulurken araba ayrı bir çarpışma kutusu olarak itilir; araba engele takılırsa
 * oyuncu da durur, dönüş engelleniyorsa araba yönünü korur.
 */
export function Player() {
  const { world, rapier } = useRapier();
  const { camera, gl } = useThree();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const bob = useRef(0);
  const scene = useGame((s) => s.scene)!;
  // Canvas yeniden kurulduğunda (kalite değişimi) güncel konumdan devam edilir.
  const spawn = { x: runtime.playerPos.x, z: runtime.playerPos.z };

  // Denetleyiciler efekt ömrüne bağlı: StrictMode'un çift mount'unda serbest bırakılmış nesne kullanılmaz.
  const ctrlRef = useRef<{ player: ReturnType<typeof world.createCharacterController>; cart: ReturnType<typeof world.createCharacterController> } | null>(null);
  useEffect(() => {
    const make = () => {
      const c = world.createCharacterController(0.02);
      c.setSlideEnabled(true);
      c.setApplyImpulsesToDynamicBodies(false);
      c.setUp({ x: 0, y: 1, z: 0 });
      return c;
    };
    const ctrls = { player: make(), cart: make() };
    ctrlRef.current = ctrls;
    return () => {
      ctrlRef.current = null;
      world.removeCharacterController(ctrls.player);
      world.removeCharacterController(ctrls.cart);
    };
  }, [world]);

  useEffect(() => {
    physicsRefs.player.body = body.current;
    physicsRefs.player.collider = collider.current;
  });

  // Fare ile bakış (pointer lock)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      runtime.yaw -= e.movementX * 0.0022;
      runtime.pitch -= e.movementY * 0.0022;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [gl]);

  const cartShape = useMemo(() => new rapier.Cuboid(CART_HALF.x, CART_HALF.y, CART_HALF.z), [rapier]);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const st = useGame.getState();
    const pc = collider.current;
    const pb = body.current;
    const cb = physicsRefs.cart.body;
    const cc = physicsRefs.cart.collider;
    const controllers = ctrlRef.current;
    if (!pc || !pb || !controllers) return;

    const frozen = st.phase !== 'playing' || !!st.checkout || st.held?.mode === 'inspect' || (st.panel !== null && st.panel !== 'cart');
    runtime.yaw -= input.look.dx * 0.0055;
    runtime.pitch -= input.look.dy * 0.0045;
    input.look.dx = 0;
    input.look.dy = 0;
    runtime.pitch = Math.max(-1.25, Math.min(1.1, runtime.pitch));

    const { forward, right, sprint } = frozen ? { forward: 0, right: 0, sprint: false } : movementAxes();
    const speed = (sprint ? RUN : WALK) * (st.cartAttached ? 0.85 : 1);
    const sy = Math.sin(runtime.yaw);
    const cy = Math.cos(runtime.yaw);
    let dx = (-sy * forward + cy * right) * speed * dt;
    let dz = (-cy * forward - sy * right) * speed * dt;

    const excludeCart = (c: RapierCollider) => !cc || c.handle !== cc.handle;
    const excludeBoth = (c: RapierCollider) => c.handle !== pc.handle && (!cc || c.handle !== cc.handle);

    if (st.cartAttached && cb && cc) {
      // 1) araba yönü kameraya doğru döner (engel varsa dönmez)
      const diff = wrapAngle(runtime.yaw - runtime.cartYaw);
      const step = Math.max(-CART_TURN_RATE * dt, Math.min(CART_TURN_RATE * dt, diff));
      if (Math.abs(step) > 1e-5) {
        const cand = runtime.cartYaw + step;
        const pos = { x: runtime.playerPos.x - Math.sin(cand) * CART_OFFSET, y: CART_HALF.y + 0.02, z: runtime.playerPos.z - Math.cos(cand) * CART_OFFSET };
        tmpQuat.setFromAxisAngle(up, cand);
        const hit = world.intersectionWithShape(pos, tmpQuat, cartShape, undefined, undefined, undefined, undefined, excludeBoth);
        if (!hit) runtime.cartYaw = cand;
      }
      const fx = -Math.sin(runtime.cartYaw);
      const fz = -Math.cos(runtime.cartYaw);
      // oyuncuyu arabanın tutma koluna doğru çek
      const ex = runtime.cartPos.x - fx * CART_OFFSET - runtime.playerPos.x;
      const ez = runtime.cartPos.z - fz * CART_OFFSET - runtime.playerPos.z;
      const pull = Math.min(1, dt * 8);
      dx += ex * pull;
      dz += ez * pull;
      // 2) oyuncu hareketi (araba hariç engeller)
      controllers.player.computeColliderMovement(pc, { x: dx, y: 0, z: dz }, undefined, undefined, excludeCart);
      const m1 = controllers.player.computedMovement();
      // 3) arabanın hedefi; araba engele takılırsa oyuncu geri çekilir
      const tx = runtime.playerPos.x + m1.x + fx * CART_OFFSET - runtime.cartPos.x;
      const tz = runtime.playerPos.z + m1.z + fz * CART_OFFSET - runtime.cartPos.z;
      controllers.cart.computeColliderMovement(cc, { x: tx, y: 0, z: tz }, undefined, undefined, (c) => c.handle !== pc.handle);
      const m2 = controllers.cart.computedMovement();
      runtime.cartPos.x += m2.x;
      runtime.cartPos.z += m2.z;
      if (Math.hypot(tx - m2.x, tz - m2.z) > 0.002) {
        runtime.playerPos.x = runtime.cartPos.x - fx * CART_OFFSET;
        runtime.playerPos.z = runtime.cartPos.z - fz * CART_OFFSET;
      } else {
        runtime.playerPos.x += m1.x;
        runtime.playerPos.z += m1.z;
      }
      cb.setNextKinematicTranslation({ x: runtime.cartPos.x, y: 0, z: runtime.cartPos.z });
      cb.setNextKinematicRotation(tmpQuat.setFromAxisAngle(up, runtime.cartYaw));
    } else {
      controllers.player.computeColliderMovement(pc, { x: dx, y: 0, z: dz });
      const m = controllers.player.computedMovement();
      runtime.playerPos.x += m.x;
      runtime.playerPos.z += m.z;
    }
    // güvenlik: mağaza sınırları dışına çıkma
    runtime.playerPos.x = Math.max(0.3, Math.min(runtime.bounds.width - 0.3, runtime.playerPos.x));
    runtime.playerPos.z = Math.max(-1.0, Math.min(runtime.bounds.length - 0.3, runtime.playerPos.z));
    pb.setNextKinematicTranslation({ x: runtime.playerPos.x, y: 0, z: runtime.playerPos.z });

    // kamera + hafif yürüme salınımı
    const movingSpeed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    bob.current += dt * (movingSpeed > 0.2 ? 8 : 0);
    camera.position.set(runtime.playerPos.x, EYE_HEIGHT + Math.sin(bob.current) * 0.012 * Math.min(1, movingSpeed), runtime.playerPos.z);
    camera.rotation.set(runtime.pitch, runtime.yaw, 0, 'YXZ');

    // kasa bölgesi
    let lane: string | null = null;
    for (const c of scene.layout.checkouts) {
      const z = c.zone;
      if (runtime.playerPos.x > z.minX - 0.4 && runtime.playerPos.x < z.maxX + 0.4 && runtime.playerPos.z > z.minZ && runtime.playerPos.z < z.maxZ + 0.6) lane = c.counterId;
    }
    if (lane !== st.nearCheckout) useGame.setState({ nearCheckout: lane });
    void state;
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[spawn.x, 0, spawn.z]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[0.57, 0.28]} position={[0, 0.85, 0]} />
    </RigidBody>
  );
}
