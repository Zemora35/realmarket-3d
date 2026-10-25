import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { SceneData } from '@realmarket/shared';

/** Raflar, kasalar, duvarlar ve dış bariyer için sabit çarpışma kutuları. */
export function StaticColliders({ scene }: { scene: SceneData }) {
  const { widthM: W } = scene.layout.params;
  const walls = scene.layout.objects.filter((o) => o.type === 'wall');
  return (
    <RigidBody type="fixed" colliders={false}>
      {scene.layout.obstacles.map((o, i) => (
        <CuboidCollider
          key={`o${i}`}
          args={[(o.maxX - o.minX) / 2, 1.1, (o.maxZ - o.minZ) / 2]}
          position={[(o.minX + o.maxX) / 2, 1.1, (o.minZ + o.maxZ) / 2]}
        />
      ))}
      {walls.map((w) => (
        <CuboidCollider key={w.id} args={[w.size.x / 2, w.size.y / 2, w.size.z / 2]} position={[w.position.x, w.size.y / 2, w.position.z]} />
      ))}
      {/* kapıların dışına (otoparka) çıkılmasını engelleyen bariyer */}
      <CuboidCollider args={[W / 2 + 1, 1.5, 0.1]} position={[W / 2, 1.5, -1.3]} />
    </RigidBody>
  );
}
