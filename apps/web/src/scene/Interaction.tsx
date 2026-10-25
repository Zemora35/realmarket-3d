import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getProductGeometry } from '@realmarket/engine-3d';
import { useGame } from '../state/game';
import { lookDirection, PICK_DISTANCE, runtime } from '../world/runtime';
import { registry } from '../world/units';
import { cartContents } from './ShoppingCart';

/** Ekran merkezindeki nişangâha göre raftaki / arabadaki ürünü seçer ve vurgular. */
export function Interaction() {
  const { camera } = useThree();
  const highlight = useRef<THREE.Mesh>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const highlightMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.35, side: THREE.BackSide, depthWrite: false }),
    [],
  );
  const dir = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }) => {
    const st = useGame.getState();
    const h = highlight.current;
    const active = st.phase === 'playing' && !st.held && !st.checkout && (st.panel === null || st.panel === 'cart');
    let unit = -1;
    let cartKey: string | null = null;
    let cartObj: THREE.Object3D | null = null;
    if (active) {
      lookDirection(runtime.yaw, runtime.pitch, dir);
      const hit = registry.raycast(camera.position, dir, PICK_DISTANCE);
      const best = hit?.dist ?? Infinity;
      if (hit) unit = hit.idx;
      const g = cartContents.group;
      if (g && g.children.length) {
        raycaster.set(camera.position, dir);
        raycaster.far = PICK_DISTANCE;
        const hits = raycaster.intersectObjects(g.children, false);
        const first = hits.find((x) => x.object.visible);
        if (first && first.distance < best) {
          unit = -1;
          cartKey = first.object.userData.key as string;
          cartObj = first.object;
        }
      }
    }
    runtime.hoveredUnit = unit;
    runtime.hoveredCartKey = cartKey;
    const productId = unit >= 0 ? registry.units[unit].productId : cartObj ? (cartObj.userData.productId as string) : null;
    if (productId !== st.hoveredProductId || st.hoveringCart !== !!cartKey) useGame.setState({ hoveredProductId: productId, hoveringCart: !!cartKey });

    if (!h) return;
    if (!productId) {
      h.visible = false;
      return;
    }
    const product = registry.products.get(productId)!;
    h.geometry = getProductGeometry(product, 'low');
    const pulse = 1.05 + Math.sin(clock.elapsedTime * 6) * 0.012;
    if (unit >= 0) {
      const u = registry.units[unit];
      h.position.copy(u.pos);
      h.position.y -= (pulse - 1) * u.half.y;
      h.rotation.set(0, u.yaw, 0);
    } else if (cartObj) {
      cartObj.updateWorldMatrix(true, false);
      cartObj.matrixWorld.decompose(h.position, h.quaternion, h.scale);
    }
    h.scale.setScalar(pulse);
    h.visible = true;
  });

  return <mesh ref={highlight} material={highlightMat} visible={false} renderOrder={2} />;
}
