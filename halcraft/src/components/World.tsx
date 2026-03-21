import { useTexture } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export function World() {
  const woodTexture = useTexture('/textures/wood.png');
  // ピクセルアートをぼやけさせずにクッキリ表示する設定
  woodTexture.magFilter = THREE.NearestFilter;
  woodTexture.minFilter = THREE.NearestFilter;
  
  // テクスチャをリピートさせる設定
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.repeat.set(50, 50);

  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh receiveShadow position={[0, -0.5, 0]}>
        {/* 幅100の広大な大地 */}
        <boxGeometry args={[100, 1, 100]} />
        <meshStandardMaterial map={woodTexture} />
      </mesh>
    </RigidBody>
  );
}
