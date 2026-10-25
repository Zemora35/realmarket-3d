import { useEffect, useRef } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

/**
 * İç mekân aydınlatması: tavan LED dizilerini temsil eden ışık şekillerinden üretilen
 * ortam haritası (PBR yansımaları için, ağ bağlantısı gerektirmez) + gölgeli ana ışık.
 */
export function Lighting({ width, length, ceiling, shadows, shadowSize }: { width: number; length: number; ceiling: number; shadows: boolean; shadowSize: number }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(width / 2, 0, length / 2);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    const r = Math.max(width, length) * 0.62;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
  }, [width, length]);

  return (
    <>
      <hemisphereLight args={['#fffdf7', '#b8b2a6', 1.15]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        ref={sun}
        position={[width / 2 + 6, ceiling + 14, length / 2 - 4]}
        intensity={1.25}
        color="#fff6e8"
        castShadow={shadows}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Environment resolution={128} frames={1} background={false}>
        <color attach="background" args={['#9aa3ad']} />
        {Array.from({ length: 6 }, (_, i) => (
          <Lightformer key={i} form="rect" intensity={2.2} position={[-10 + i * 4, 6, 0]} rotation-x={Math.PI / 2} scale={[1.2, 20, 1]} />
        ))}
        <Lightformer form="rect" intensity={0.8} color="#dfe8f2" position={[0, 2, -12]} scale={[30, 4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#f2ebe0" position={[0, 2, 12]} rotation-y={Math.PI} scale={[30, 4, 1]} />
      </Environment>
    </>
  );
}
