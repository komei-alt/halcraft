import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

export function Environment() {
  const texture = useTexture('/textures/stars.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  // texture.mapping = THREE.EquirectangularReflectionMapping;

  return (
    <mesh>
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} />
    </mesh>
  );
}
