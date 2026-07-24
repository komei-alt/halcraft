// AABB衝突判定ユーティリティ
// プレイヤー・モブ共通のブロック衝突チェック関数
// MobManager / Player / TurretRenderer 等から利用

import { BLOCK_IDS, BLOCK_DEFS, type BlockId } from '../types/blocks';

/** ブロック取得関数の型（useWorldStore.getBlock と同じシグネチャ） */
export type GetBlockFn = (x: number, y: number, z: number) => BlockId;

interface BlockCollisionBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** 階段1段分の高さ。Playerの段差解決と表示モデルで共有する基準値。 */
export const STAIRS_STEP_HEIGHT = 0.5;

const FULL_BLOCK_COLLISION_BOXES: readonly BlockCollisionBox[] = [{
  minX: 0,
  maxX: 1,
  minY: 0,
  maxY: 1,
  minZ: 0,
  maxZ: 1,
}];

/** サボテン等、見た目どおり少し内側へ寄せた当たり判定。 */
const INSET_BLOCK_COLLISION_BOXES: readonly BlockCollisionBox[] = [{
  minX: 0.12,
  maxX: 0.88,
  minY: 0,
  maxY: 1,
  minZ: 0.12,
  maxZ: 0.88,
}];

/**
 * 表示モデルと同じく、下段は全面、高段は+Z側半分に配置する。
 * 高さを0.48/0.96に留め、0.5m step-up後の接地判定へ僅かな余裕を残す。
 */
const STAIRS_COLLISION_BOXES: readonly BlockCollisionBox[] = [
  {
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 0.48,
    minZ: 0,
    maxZ: 1,
  },
  {
    minX: 0,
    maxX: 1,
    minY: 0.48,
    maxY: 0.96,
    minZ: 0.5,
    maxZ: 1,
  },
];

export function getBlockCollisionBoxes(blockId: BlockId): readonly BlockCollisionBox[] {
  if (blockId === BLOCK_IDS.STAIRS) return STAIRS_COLLISION_BOXES;
  if (BLOCK_DEFS[blockId]?.collisionShape === 'inset') return INSET_BLOCK_COLLISION_BOXES;
  return FULL_BLOCK_COLLISION_BOXES;
}

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

function findAABBCollisionTop(
  getBlock: GetBlockFn,
  px: number,
  py: number,
  pz: number,
  radius: number,
  height: number,
  solidCheck: ((blockId: BlockId) => boolean) | undefined,
  firstMatchOnly: boolean,
): number | null {
  const minX = px - radius;
  const maxX = px + radius;
  const minY = py;
  const maxY = py + height;
  const minZ = pz - radius;
  const maxZ = pz + radius;
  const isSolid = solidCheck ?? isBlockSolid;
  let highestTop: number | null = null;

  for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
    for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
      for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
        const blockId = getBlock(bx, by, bz);
        if (!isSolid(blockId)) continue;

        for (const box of getBlockCollisionBoxes(blockId)) {
          const boxMaxY = by + box.maxY;
          if (
            maxX > bx + box.minX && minX < bx + box.maxX &&
            maxY > by + box.minY && minY < boxMaxY &&
            maxZ > bz + box.minZ && minZ < bz + box.maxZ
          ) {
            if (firstMatchOnly) return boxMaxY;
            highestTop = highestTop === null ? boxMaxY : Math.max(highestTop, boxMaxY);
          }
        }
      }
    }
  }

  return highestTop;
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
  return findAABBCollisionTop(
    getBlock,
    px,
    py,
    pz,
    radius,
    height,
    solidCheck,
    true,
  ) !== null;
}

/**
 * 下向き移動時に重なった衝突形状のうち、最も高い上面Yを返す。
 * 通常ブロックでは従来どおり整数上面、階段では0.48/0.96段へ着地できる。
 */
export function getAABBCollisionTop(
  getBlock: GetBlockFn,
  px: number,
  py: number,
  pz: number,
  radius: number,
  height: number,
  solidCheck?: (blockId: BlockId) => boolean,
): number | null {
  return findAABBCollisionTop(
    getBlock,
    px,
    py,
    pz,
    radius,
    height,
    solidCheck,
    false,
  );
}

/**
 * (x, z) 直下で fromY 付近から下へ探し、最も近い固体上面のYを返す。
 * プレイヤーが建てた床・橋など heightmap に無い面にも乗る。
 * 見つからない場合は fallbackY。
 */
export function findSurfaceY(
  getBlock: GetBlockFn,
  x: number,
  z: number,
  fromY: number,
  maxDrop = 48,
  fallbackY = 0,
): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  let y = Math.floor(fromY);

  // 固体の中にいる場合は上へ少し逃がす
  for (let climb = 0; climb < 12 && isBlockSolid(getBlock(bx, y, bz)); climb++) {
    y += 1;
  }

  for (let drop = 0; drop < maxDrop; drop++) {
    const below = y - 1;
    if (below < 0) {
      return 0;
    }
    const blockId = getBlock(bx, below, bz);
    if (isBlockSolid(blockId)) {
      const boxes = getBlockCollisionBoxes(blockId);
      let top = below;
      for (const box of boxes) {
        top = Math.max(top, below + box.maxY);
      }
      return top;
    }
    y = below;
  }

  return fallbackY;
}

/**
 * 指定位置が水の中かチェック
 * プレイヤーの目線高さで判定する
 */
export function isInWater(getBlock: GetBlockFn, x: number, y: number, z: number): boolean {
  const blockId = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return blockId === BLOCK_IDS.WATER;
}

/**
 * 指定位置が溶岩の中かチェック
 */
export function isInLava(getBlock: GetBlockFn, x: number, y: number, z: number): boolean {
  const blockId = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return blockId === BLOCK_IDS.LAVA;
}
