// 滑走路構造物生成
// 平坦な鉄ブロック路面 + 中央ライン + 端ライト + 上空クリアランス

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../../types/blocks';
import {
  AIRPLANE_SPAWN,
  RUNWAY_CENTER,
  RUNWAY_CLEARANCE,
  RUNWAY_LENGTH,
  RUNWAY_WIDTH,
  TANK_SPAWN,
} from '../constants';
import { getTerrainHeight } from '../heightmap';
import type { ChunkData } from '../types';

/**
 * 滑走路を生成する
 * X方向に長い滑走路として扱い、飛行機は西端から東向きに加速する。
 */
export function placeRunway(chunk: ChunkData, cx: number, cz: number): void {
  const halfLength = Math.floor(RUNWAY_LENGTH / 2);
  const halfWidth = Math.floor(RUNWAY_WIDTH / 2);
  const runwayY = getTerrainHeight(RUNWAY_CENTER.x, RUNWAY_CENTER.z);

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const worldX = cx * CHUNK_SIZE + lx;
      const worldZ = cz * CHUNK_SIZE + lz;
      const relX = worldX - RUNWAY_CENTER.x;
      const relZ = worldZ - RUNWAY_CENTER.z;

      const inRunway = Math.abs(relX) <= halfLength && Math.abs(relZ) <= halfWidth;
      const inParking =
        Math.abs(worldX - TANK_SPAWN.x) <= 5 &&
        Math.abs(worldZ - TANK_SPAWN.z) <= 5;
      const inPlanePad =
        Math.abs(worldX - AIRPLANE_SPAWN.x) <= 5 &&
        Math.abs(worldZ - AIRPLANE_SPAWN.z) <= 4;

      if (!inRunway && !inParking && !inPlanePad) continue;

      const surfaceY = getTerrainHeight(worldX, worldZ);
      for (let y = Math.min(surfaceY, runwayY) - 2; y <= runwayY + RUNWAY_CLEARANCE; y++) {
        if (y < 0 || y >= WORLD_HEIGHT) continue;
        if (y < runwayY) {
          chunk[lx][y][lz] = BLOCK_IDS.BEDROCK;
        } else if (y === runwayY) {
          chunk[lx][y][lz] = getRunwaySurfaceBlock(relX, relZ, inRunway, inParking);
        } else {
          chunk[lx][y][lz] = BLOCK_IDS.AIR;
        }
      }

      if (runwayY + 1 < WORLD_HEIGHT && shouldPlaceRunwayLight(relX, relZ, halfLength, halfWidth, inRunway)) {
        chunk[lx][runwayY + 1][lz] = BLOCK_IDS.TORCH;
      }
    }
  }
}

function getRunwaySurfaceBlock(
  relX: number,
  relZ: number,
  inRunway: boolean,
  inParking: boolean,
): BlockId {
  if (inParking) return BLOCK_IDS.IRON_CRACKED;
  if (!inRunway) return BLOCK_IDS.IRON;

  const centerLine = relZ === 0 && Math.abs(relX) % 6 <= 2;
  const thresholdMark = Math.abs(Math.abs(relX) - Math.floor(RUNWAY_LENGTH / 2) + 5) <= 1 && Math.abs(relZ) <= 3;
  if (centerLine || thresholdMark) return BLOCK_IDS.ELECTRIC;
  return BLOCK_IDS.IRON;
}

function shouldPlaceRunwayLight(
  relX: number,
  relZ: number,
  halfLength: number,
  halfWidth: number,
  inRunway: boolean,
): boolean {
  if (!inRunway) return false;
  const atEdge = Math.abs(relZ) === halfWidth;
  const atEnd = Math.abs(relX) === halfLength;
  return (atEdge && Math.abs(relX) % 8 === 0) || (atEnd && Math.abs(relZ) % 3 === 0);
}

/** チャンクが滑走路エリアに含まれるかチェック */
export function chunkContainsRunway(cx: number, cz: number): boolean {
  const chunkMinX = cx * CHUNK_SIZE;
  const chunkMaxX = chunkMinX + CHUNK_SIZE;
  const chunkMinZ = cz * CHUNK_SIZE;
  const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

  const halfLength = Math.floor(RUNWAY_LENGTH / 2) + 7;
  const halfWidth = Math.floor(RUNWAY_WIDTH / 2) + 12;
  return (
    chunkMaxX > RUNWAY_CENTER.x - halfLength &&
    chunkMinX < RUNWAY_CENTER.x + halfLength &&
    chunkMaxZ > RUNWAY_CENTER.z - halfWidth &&
    chunkMinZ < RUNWAY_CENTER.z + halfWidth
  );
}
