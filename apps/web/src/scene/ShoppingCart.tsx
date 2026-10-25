import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { CART_DIMENSIONS, getProductGeometry, getProductMaterials } from '@realmarket/engine-3d';
import { packCart, CART_BASKET } from '@realmarket/shopping';
import { useGame } from '../state/game';
import { CART_HALF, physicsRefs } from '../world/physics-refs';
import { runtime } from '../world/runtime';
import { registry } from '../world/units';
import { CartBody } from './Fixtures';

/** Araba içindeki ürünlerin nesneleri (seçim için Interaction tarafından taranır). */
export const cartContents = { group: null as THREE.Group | null };

const BASKET_CENTER_Z = (CART_DIMENSIONS.basketFrontZ + CART_DIMENSIONS.basketBackZ) / 2;
const FLY_TIME = 0.45;

function dimsOf(productId: string) {
  const p = registry.products.get(productId);
  const d = p?.dimensions ?? { widthMm: 80, heightMm: 200, depthMm: 80 };
  return { w: d.widthMm / 1000, h: d.heightMm / 1000, d: d.depthMm / 1000 };
}

/** Sepet-yerel paketleme sonucunu araba-yerel dönüşüme çevirir. */
function itemTransform(packed: ReturnType<typeof packCart>['items'][number], productId: string) {
  const { w, h } = dimsOf(productId);
  const pos = new THREE.Vector3(packed.x, CART_DIMENSIONS.basketFloorY + 0.012 + packed.y, BASKET_CENTER_Z + packed.z);
  const quat = new THREE.Quaternion();
  if (packed.lying) {
    // yükseklik ekseni x'e yatırılır: taban merkezi kayar
    quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    pos.x += h / 2;
    pos.y += w / 2;
  }
  return { pos, quat };
}

export function ShoppingCart() {
  const cartUnits = useGame((s) => s.cartUnits);
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const contents = useRef<THREE.Group>(null);
  const flyGroup = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  const last = useRef(new THREE.Vector3().copy(runtime.cartPos));

  useEffect(() => {
    physicsRefs.cart.body = body.current;
    physicsRefs.cart.collider = collider.current;
    cartContents.group = contents.current;
  });

  const packed = useMemo(() => {
    const r = packCart(cartUnits.map((c) => ({ key: c.key, ...dimsOf(c.productId) })), CART_BASKET);
    return r.items.map((it, i) => ({ unit: cartUnits[i], ...itemTransform(it, cartUnits[i].productId) }));
  }, [cartUnits]);

  useFrame((_, dt) => {
    // tekerlek dönüşü: kat edilen mesafe / yarıçap
    const moved = new THREE.Vector3().subVectors(runtime.cartPos, last.current);
    const dist = moved.length();
    if (dist > 1e-5) {
      const fwd = new THREE.Vector3(-Math.sin(runtime.cartYaw), 0, -Math.cos(runtime.cartYaw));
      const sign = Math.sign(moved.dot(fwd)) || 1;
      for (const w of wheels.current) if (w) w.rotation.x -= (sign * dist) / CART_DIMENSIONS.wheelRadius;
    }
    last.current.copy(runtime.cartPos);

    // uçan ürünler (elden arabaya animasyon)
    const fg = flyGroup.current;
    const cg = contents.current;
    if (!fg || !cg || !body.current) return;
    const now = performance.now();
    const cartMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(runtime.cartPos.x, 0, runtime.cartPos.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), runtime.cartYaw),
      new THREE.Vector3(1, 1, 1),
    );
    runtime.flying = runtime.flying.filter((f) => (now - f.start) / 1000 < FLY_TIME + 0.05);
    const flyingKeys = new Set(runtime.flying.map((f) => f.key));
    for (const child of cg.children) child.visible = !flyingKeys.has(child.userData.key as string);
    fg.children.forEach((child) => {
      const f = runtime.flying.find((x) => x.key === child.userData.key);
      const target = packed.find((p) => p.unit.key === child.userData.key);
      if (!f || !target) {
        child.visible = false;
        return;
      }
      child.visible = true;
      const t = Math.min(1, (now - f.start) / 1000 / FLY_TIME);
      const e = t * t * (3 - 2 * t);
      const to = target.pos.clone().applyMatrix4(cartMatrix);
      const toQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), runtime.cartYaw).multiply(target.quat);
      child.position.lerpVectors(f.from, to, e);
      child.position.y += Math.sin(Math.PI * e) * 0.25;
      child.quaternion.slerpQuaternions(f.fromQuat, toQ, e);
    });
    void dt;
  });

  return (
    <group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[runtime.cartPos.x, 0, runtime.cartPos.z]} rotation={[0, runtime.cartYaw, 0]}>
        <CuboidCollider ref={collider} args={[CART_HALF.x, CART_HALF.y, CART_HALF.z]} position={[0, CART_HALF.y + 0.02, 0]} />
        <CartBody wheelRefs={wheels} />
        <group ref={contents}>
          {packed.map((p) => (
            <CartItem key={p.unit.key} productId={p.unit.productId} unitKey={p.unit.key} position={p.pos} quaternion={p.quat} />
          ))}
        </group>
      </RigidBody>
      <group ref={flyGroup}>
        {packed
          .filter((p) => runtime.flying.some((f) => f.key === p.unit.key))
          .map((p) => (
            <CartItem key={p.unit.key} productId={p.unit.productId} unitKey={p.unit.key} />
          ))}
      </group>
    </group>
  );
}

function CartItem({ productId, unitKey, position, quaternion }: { productId: string; unitKey: string; position?: THREE.Vector3; quaternion?: THREE.Quaternion }) {
  const product = registry.products.get(productId);
  if (!product) return null;
  return (
    <mesh
      geometry={getProductGeometry(product, 'high')}
      material={getProductMaterials(product)}
      position={position}
      quaternion={quaternion}
      userData={{ key: unitKey, productId }}
      castShadow
    />
  );
}
