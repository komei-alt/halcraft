// 乗り物モデルの自動接地フック
// GLBモデルのバウンディングボックスから、底面がY=0に揃う位置を自動計算する。
// 手動で MODEL_POSITION.y や BODY_HEIGHT を調整する必要がなくなる。

import { useMemo } from 'react';
import * as THREE from 'three';
import { computeGroundOffset } from '../../utils/autoGround';

/**
 * GLBモデルの底面を自動接地する位置を返すフック。
 *
 * @param scene    GLTFLoader でロードしたシーン
 * @param scale    モデルに適用するスケール
 * @param modelPath キャッシュ用のモデルパス
 * @param xzOffset  XZ方向の手動オフセット [x, z]
 * @returns  `primitive position` として使える [x, y, z] タプル
 */
export function useAutoGroundPosition(
  scene: THREE.Object3D,
  scale: number,
  modelPath: string,
  xzOffset: [number, number] = [0, 0],
): [number, number, number] {
  return useMemo(() => {
    const autoY = computeGroundOffset(scene, scale, modelPath);
    return [xzOffset[0], autoY, xzOffset[1]];
  }, [scene, scale, modelPath, xzOffset]);
}
