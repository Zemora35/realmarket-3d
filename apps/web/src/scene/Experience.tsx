import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from '../state/game';
import { runtime } from '../world/runtime';
import { Fixtures } from './Fixtures';
import { HeldItem } from './HeldItem';
import { Interaction } from './Interaction';
import { Lighting } from './Lighting';
import { NavPath } from './NavPath';
import { Player } from './Player';
import { Products } from './Products';
import { ShoppingCart } from './ShoppingCart';
import { StaticColliders } from './StaticColliders';
import { StoreShell } from './StoreShell';

const QUALITY = {
  low: { dpr: [0.6, 1] as [number, number], shadows: false, shadowSize: 512, antialias: false },
  medium: { dpr: [0.8, 1.5] as [number, number], shadows: true, shadowSize: 1024, antialias: true },
  high: { dpr: [1, 2] as [number, number], shadows: true, shadowSize: 2048, antialias: true },
};

function FpsMeter() {
  const acc = useRef({ frames: 0, t: 0 }).current;
  useFrame((_, dt) => {
    acc.frames++;
    acc.t += dt;
    if (acc.t >= 0.5) {
      runtime.fps = Math.round(acc.frames / acc.t);
      acc.frames = 0;
      acc.t = 0;
    }
  });
  return null;
}

/** Geliştirme/test: sahne grafiğine erişim (performans ölçümü ve uçtan uca testler). */
function DevHandle() {
  const state = useThree();
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__r3f = state;
  }, [state]);
  return null;
}

export function Experience() {
  const scene = useGame((s) => s.scene);
  const quality = useGame((s) => s.quality);
  const [dprScale, setDprScale] = useState(1);
  if (!scene) return null;
  const q = QUALITY[quality];
  const { widthM, lengthM, ceilingHeightM } = scene.layout.params;
  return (
    <Canvas
      key={quality}
      shadows={q.shadows ? 'soft' : false}
      dpr={[q.dpr[0], q.dpr[1] * dprScale]}
      gl={{ antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 70, near: 0.03, far: 140, position: [runtime.playerPos.x, 1.62, runtime.playerPos.z] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
    >
      <color attach="background" args={['#bfd9ee']} />
      <PerformanceMonitor onDecline={() => setDprScale((s) => Math.max(0.6, s - 0.15))} onIncline={() => setDprScale((s) => Math.min(1, s + 0.1))} />
      <AdaptiveDpr pixelated={false} />
      <FpsMeter />
      <DevHandle />
      <Suspense fallback={null}>
        <Lighting width={widthM} length={lengthM} ceiling={ceilingHeightM} shadows={q.shadows} shadowSize={q.shadowSize} />
        <StoreShell scene={scene} />
        <Fixtures scene={scene} shadows={q.shadows} />
        <Products scene={scene} quality={quality} />
        <Physics gravity={[0, 0, 0]} timeStep="vary">
          <StaticColliders scene={scene} />
          <Player />
          <ShoppingCart />
        </Physics>
        <HeldItem />
        <Interaction />
        <NavPath />
      </Suspense>
    </Canvas>
  );
}
