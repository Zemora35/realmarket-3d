import * as THREE from 'three';
import type { NavGrid } from '@realmarket/navigation';

/**
 * Kare başına değişen, React yeniden çizimi gerektirmeyen paylaşılan durum.
 * (Oyuncu/araba konumu, imleç hedefi, animasyonlar.)
 */
export const runtime = {
  playerPos: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  cartPos: new THREE.Vector3(),
  cartYaw: 0,
  hoveredUnit: -1,
  hoveredCartKey: null as string | null,
  /** Elde tutulan ürün animasyonu. */
  held: {
    kind: 'idle' as 'idle' | 'pick' | 'toShelf',
    start: 0,
    from: new THREE.Vector3(),
    fromQuat: new THREE.Quaternion(),
    /** İnceleme modunda kullanıcı dönüşü */
    spinX: 0,
    spinY: 0,
    zoom: 0,
    worldPos: new THREE.Vector3(),
    worldQuat: new THREE.Quaternion(),
  },
  /** Arabaya uçan ürünler. */
  flying: [] as { key: string; productId: string; from: THREE.Vector3; fromQuat: THREE.Quaternion; start: number }[],
  grid: null as NavGrid | null,
  bounds: { width: 32, length: 30 },
  fps: 0,
  /** Otomatik testler için: ışın dışı ürün seçimi. */
  forcedUnit: -1,
};

export const HAND_OFFSET = new THREE.Vector3(0.18, -0.2, -0.55);
export const INSPECT_OFFSET = new THREE.Vector3(0, 0, -0.42);
export const PICK_DISTANCE = 2.4;
export const CART_REACH = 3.2;

/** Kameranın bakış yönü (yaw, pitch → birim vektör). */
export function lookDirection(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}
