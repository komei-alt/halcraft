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
  // 同じパスでも scale が違うとオフセットが変わるため、キーに scale を含める
  const key = cacheKey ? `${cacheKey}@${scale}` : undefined;
  if (key) {
    const cached = groundOffsetCache.get(key);
    if (cached !== undefined) return cached;
  }

  // ワールド行列を最新化してから AABB を測る（未更新だと空中浮き／沈みの原因になる）
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) {
    return 0;
  }

  // box.min.y * scale = スケール適用後のモデル最低点
  // これを 0 に持ち上げるには -min.y * scale が必要
  const offset = -box.min.y * scale;

  if (key) {
    groundOffsetCache.set(key, offset);
  }

  return offset;
}
