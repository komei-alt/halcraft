// GLBモデルをR3Fで安全に再利用するための小さなユーティリティ

import * as THREE from 'three';
import { cloneHaruModelScene } from '../../utils/modelMaterials';

export function cloneSceneWithMaterials(scene: THREE.Object3D): THREE.Object3D {
  return cloneHaruModelScene(scene);
}
