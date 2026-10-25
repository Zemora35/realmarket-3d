import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Gerçek ölçülere yakın market arabası (metre). Yerel eksenler: ileri = -z,
 * tutma kolu +z tarafında, tekerlekler y=0 zemininde.
 */
export const CART_DIMENSIONS = {
  length: 0.95,
  width: 0.56,
  handleHeight: 1.0,
  basketFloorY: 0.5,
  basketTopY: 0.93,
  basketFrontZ: -0.44,
  basketBackZ: 0.36,
  wheelRadius: 0.062,
  wheelPositions: [
    [-0.22, -0.36],
    [0.22, -0.36],
    [-0.22, 0.34],
    [0.22, 0.34],
  ] as [number, number][],
};

function bar(from: THREE.Vector3, to: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const len = from.distanceTo(to);
  const g = new THREE.BoxGeometry(thickness, len, thickness);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Tel sepet + şasi: tek birleştirilmiş geometri (düşük çizim çağrısı). */
export function buildCartFrameGeometry(): { frame: THREE.BufferGeometry; grip: THREE.BufferGeometry } {
  const D = CART_DIMENSIONS;
  const parts: THREE.BufferGeometry[] = [];
  const t = 0.006;
  const y0 = D.basketFloorY;
  const y1 = D.basketTopY;
  const zf = D.basketFrontZ;
  const zb = D.basketBackZ;
  // sepet alttan daralır
  const hwTop = D.width / 2;
  const hwBot = D.width / 2 - 0.05;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // taban ızgarası
  for (let x = -hwBot; x <= hwBot + 1e-6; x += 0.04) parts.push(bar(v(x, y0, zf + 0.05), v(x, y0, zb), t));
  for (let z = zf + 0.05; z <= zb + 1e-6; z += 0.05) parts.push(bar(v(-hwBot, y0, z), v(hwBot, y0, z), t));
  // yan duvarlar: dikey teller
  for (let z = zf + 0.05; z <= zb + 1e-6; z += 0.045) {
    parts.push(bar(v(-hwBot, y0, z), v(-hwTop, y1, z), t));
    parts.push(bar(v(hwBot, y0, z), v(hwTop, y1, z), t));
  }
  // yatay raylar
  for (let k = 0; k <= 4; k++) {
    const y = y0 + ((y1 - y0) * k) / 4;
    const hw = hwBot + ((hwTop - hwBot) * k) / 4;
    const zfront = zf + 0.05 - 0.05 * (k / 4);
    parts.push(bar(v(-hw, y, zfront), v(-hw, y, zb), k === 4 ? 0.014 : t));
    parts.push(bar(v(hw, y, zfront), v(hw, y, zb), k === 4 ? 0.014 : t));
    parts.push(bar(v(-hw, y, zfront), v(hw, y, zfront), k === 4 ? 0.014 : t));
    parts.push(bar(v(-hw, y, zb), v(hw, y, zb), k === 4 ? 0.014 : t));
  }
  // ön ve arka dikey teller
  for (let x = -hwBot; x <= hwBot + 1e-6; x += 0.045) {
    parts.push(bar(v(x, y0, zf + 0.05), v(x * (hwTop / hwBot), y1, zf), t));
    parts.push(bar(v(x, y0, zb), v(x * (hwTop / hwBot), y1, zb), t));
  }
  // şasi
  const thick = 0.022;
  for (const sx of [-1, 1]) {
    const x = sx * 0.22;
    parts.push(bar(v(x, 0.13, -0.36), v(x, 0.13, 0.34), thick));
    parts.push(bar(v(x, 0.13, 0.34), v(sx * hwBot, y0, zb), thick));
    parts.push(bar(v(x, 0.13, -0.36), v(sx * (hwBot - 0.02), y0, zf + 0.06), thick));
    // tutma koluna çıkan direkler
    parts.push(bar(v(sx * hwTop, y1, zb), v(sx * hwTop, D.handleHeight, zb + 0.1), 0.02));
  }
  // alt raf
  for (let z = -0.3; z <= 0.3; z += 0.05) parts.push(bar(v(-0.2, 0.15, z), v(0.2, 0.15, z), t));
  // tekerlek çatalları
  for (const [x, z] of D.wheelPositions) parts.push(bar(v(x, D.wheelRadius, z), v(x, 0.13, z), 0.02));
  const frame = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  frame.computeVertexNormals();
  const grip = new THREE.CylinderGeometry(0.018, 0.018, D.width + 0.02, 12);
  grip.rotateZ(Math.PI / 2);
  grip.translate(0, D.handleHeight, zb + 0.1);
  return { frame, grip };
}

export function buildWheelGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(CART_DIMENSIONS.wheelRadius, CART_DIMENSIONS.wheelRadius, 0.03, 16);
  g.rotateZ(Math.PI / 2);
  return g;
}
