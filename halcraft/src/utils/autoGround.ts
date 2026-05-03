// 自動接地ユーティリティ
// GLBモデルのバウンディングボックスから、モデルの底面が Y=0 に揃うオフセットを計算する。
// 手動で modelPosition.y を調整する必要がなくなり、新規モデル追加時のY軸ズレを構造的に防止する。

import * as THREE from 'three';

const groundOffsetCache = new Map<string, number>();

/**
 * GLBシーンのバウンディングボックスを計算し、
 * モデルの底面を Y=0 に揃えるために必要な Y オフセットを返す。
 *
 * @param scene  GLTFLoader でロードしたシーン（またはそのクローン）
 * @param scale  描画時に適用するスケール
 * @param cacheKey  キャッシュキー（モデルパス等）。省略時はキャッシュしない
 * @returns  `primitive position` の Y に設定すべき値
 *
 * @example
 * const offset = computeGroundOffset(scene, 0.58, '/models/tank.glb');
 * <primitive position={[0, offset, 0]} scale={0.58} />
 */
export function computeGroundOffset(
  scene: THREE.Object3D,
  scale: number,
  cacheKey?: string,
): number {
  if (cacheKey) {
    const cached = groundOffsetCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  const box = new THREE.Box3().setFromObject(scene);

  // box.min.y * scale = スケール適用後のモデル最低点
  // これを 0 に持ち上げるには -min.y * scale が必要
  const offset = -box.min.y * scale;

  if (cacheKey) {
    groundOffsetCache.set(cacheKey, offset);
  }

  return offset;
}
