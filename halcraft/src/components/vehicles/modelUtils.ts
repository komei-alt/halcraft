// GLBモデルをR3Fで安全に再利用するための小さなユーティリティ

import * as THREE from 'three';

export function cloneSceneWithMaterials(scene: THREE.Object3D): THREE.Object3D {
  const cloned = scene.clone(true);
  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => mat.clone());
    } else {
      child.material = child.material.clone();
    }
  });
  return cloned;
}
