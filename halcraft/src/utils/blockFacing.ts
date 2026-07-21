// 非標準ブロック（ドア・はしご・ベッド等）の向き推定
// 隣接する固体ブロックを壁／背もたれとして使い、メタデータなしでも向きを決める

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from '../types/blocks';

export type CardinalFacing = 'n' | 's' | 'e' | 'w';

function isSupportBlock(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return false;
  const def = BLOCK_DEFS[blockId];
  if (!def) return false;
  return !def.transparent && !def.nonStandard && !def.isLiquid;
}

/**
 * 壁に寄せて置くモデル用の向き。
 * デフォルトモデルは +Z 側（南の壁）に張り付く前提なので、
 * 固体の隣がある方向を優先して返す。
 */
export function inferWallFacing(
  getBlock: (x: number, y: number, z: number) => BlockId,
  x: number,
  y: number,
  z: number,
): CardinalFacing {
  // 優先順: 現状のデフォルト(+Z) → 反対 → 東西
  const candidates: Array<{ facing: CardinalFacing; dx: number; dz: number }> = [
    { facing: 's', dx: 0, dz: 1 },
    { facing: 'n', dx: 0, dz: -1 },
    { facing: 'e', dx: 1, dz: 0 },
    { facing: 'w', dx: -1, dz: 0 },
  ];

  for (const candidate of candidates) {
    if (isSupportBlock(getBlock(x + candidate.dx, y, z + candidate.dz))) {
      return candidate.facing;
    }
  }

  return 's';
}

/** ベッドなど「頭側」を壁に寄せる向き（壁がある方向が頭側） */
export function inferBedFacing(
  getBlock: (x: number, y: number, z: number) => BlockId,
  x: number,
  y: number,
  z: number,
): CardinalFacing {
  return inferWallFacing(getBlock, x, y, z);
}

/** CardinalFacing → Y 軸回転（デフォルト +Z 張り付きモデル基準） */
export function facingToYaw(facing: CardinalFacing): number {
  switch (facing) {
    case 's':
      return 0;
    case 'e':
      return Math.PI / 2;
    case 'n':
      return Math.PI;
    case 'w':
      return -Math.PI / 2;
  }
}

/** 松明の設置姿勢（床置き or 壁付け） */
export interface TorchMount {
  ox: number;
  oy: number;
  oz: number;
  rotX: number;
  rotY: number;
}

/**
 * 松明の支持面を推定する。
 * 横に固体があれば壁付け（少し寄せて傾け）、なければ床置き。
 */
export function inferTorchMount(
  getBlock: (x: number, y: number, z: number) => BlockId,
  x: number,
  y: number,
  z: number,
): TorchMount {
  const walls: Array<TorchMount & { dx: number; dz: number }> = [
    { dx: 0, dz: 1, ox: 0, oy: 0.12, oz: 0.34, rotX: 0.62, rotY: 0 },
    { dx: 0, dz: -1, ox: 0, oy: 0.12, oz: -0.34, rotX: 0.62, rotY: Math.PI },
    { dx: 1, dz: 0, ox: 0.34, oy: 0.12, oz: 0, rotX: 0.62, rotY: -Math.PI / 2 },
    { dx: -1, dz: 0, ox: -0.34, oy: 0.12, oz: 0, rotX: 0.62, rotY: Math.PI / 2 },
  ];

  for (const wall of walls) {
    if (isSupportBlock(getBlock(x + wall.dx, y, z + wall.dz))) {
      return {
        ox: wall.ox,
        oy: wall.oy,
        oz: wall.oz,
        rotX: wall.rotX,
        rotY: wall.rotY,
      };
    }
  }

  return { ox: 0, oy: 0, oz: 0, rotX: 0, rotY: 0 };
}
