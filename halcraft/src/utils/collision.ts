// AABB衝突判定ユーティリティ
// プレイヤー・モブ共通のブロック衝突チェック関数
// MobManager / Player / TurretRenderer 等から利用

import { BLOCK_IDS, BLOCK_DEFS, type BlockId } from '../types/blocks';

/** ブロック取得関数の型（useWorldStore.getBlock と同じシグネチャ） */
export type GetBlockFn = (x: number, y: number, z: number) => BlockId;

/**
 * ブロックが固体（通行不可）かチェック
 * 空気ブロックと noCollision（松明等）は通過可能
 */
export function isBlockSolid(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return false;
  const def = BLOCK_DEFS[blockId];
  if (def?.noCollision) return false;
  return true;
}

/**
 * AABB衝突判定 — 指定位置・サイズのエンティティがブロックと重なるかチェック
 *
 * @param getBlock ワールドのブロック取得関数
 * @param px エンティティの中心X座標
 * @param py エンティティの足元Y座標
 * @param pz エンティティの中心Z座標
 * @param radius エンティティの半径（XZ）
 * @param height エンティティの高さ（Y方向）
 * @param solidCheck ブロックが固体かの判定関数（デフォルト: AIR以外は固体）
 * @returns 衝突しているかどうか
 */
export function checkAABBCollision(
  getBlock: GetBlockFn,
  px: number,
  py: number,
  pz: number,
  radius: number,
  height: number,
  solidCheck?: (blockId: BlockId) => boolean,
): boolean {
  const minX = px - radius;
  const maxX = px + radius;
  const minY = py;
  const maxY = py + height;
  const minZ = pz - radius;
  const maxZ = pz + radius;

  const isSolid = solidCheck ?? ((id: BlockId) => id !== BLOCK_IDS.AIR);

  for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
    for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
      for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
        if (!isSolid(getBlock(bx, by, bz))) continue;

        // ブロックAABBとの重なり判定
        if (
          maxX > bx && minX < bx + 1 &&
          maxY > by && minY < by + 1 &&
          maxZ > bz && minZ < bz + 1
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
