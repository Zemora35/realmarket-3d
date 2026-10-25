import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';

/** Oyuncu ve araba fizik gövdelerine bileşenler arası erişim. */
export const physicsRefs = {
  player: { body: null as RapierRigidBody | null, collider: null as RapierCollider | null },
  cart: { body: null as RapierRigidBody | null, collider: null as RapierCollider | null },
};

/** Araba merkezi ile oyuncu merkezi arası mesafe (kol + kol mesafesi). */
export const CART_OFFSET = 0.8;
export const CART_HALF = { x: 0.29, y: 0.5, z: 0.48 };
