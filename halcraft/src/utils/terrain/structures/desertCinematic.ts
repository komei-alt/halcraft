// 砂漠決戦ステージの映画的な景観レイヤー
// ハルの原画から再設計した高品質テクスチャで、メサ・オアシス・街道・サボテンを構成する。

import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../../../types/blocks';
import { STAGE_LANDMARK_CENTER } from '../../../types/stageLandmarks';
import { PLAYER_SPAWN } from '../constants';
import { getTerrainHeight } from '../heightmap';
import { getCurrentTerrainStage } from '../stageConfig';
import type { ChunkData } from '../types';

interface MesaFormation {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  terraces: number;
}

const OASIS_CENTER = { x: -20, z: 31 } as const;
const OASIS_RADIUS_X = 10;
const OASIS_RADIUS_Z = 7;

const MESA_FORMATIONS: readonly MesaFormation[] = [
  { x: -49, z: 8, radiusX: 13, radiusZ: 10, height: 19, terraces: 6 },
  { x: -6, z: 62, radiusX: 14, radiusZ: 11, height: 18, terraces: 6 },
  { x: -65, z: 45, radiusX: 10, radiusZ: 8, height: 16, terraces: 5 },
  { x: -39, z: 81, radiusX: 9, radiusZ: 8, height: 15, terraces: 5 },
  { x: 18, z: 49, radiusX: 8, radiusZ: 7, height: 13, terraces: 4 },
] as const;

const HERO_CACTI = [
  { x: -8, z: -5, height: 7, arm: 1 },
  { x: -15, z: 4, height: 5, arm: -1 },
  { x: -24, z: 17, height: 6, arm: 1 },
  { x: -3, z: 27, height: 5, arm: -1 },
  { x: -31, z: 32, height: 4, arm: 1 },
  { x: 7, z: 35, height: 5, arm: -1 },
] as const;

function hashUnit(x: number, z: number, salt: number): number {
  let value = Math.imul(x | 0, 0x45d9f3b) ^ Math.imul(z | 0, 0x119de1f3) ^ Math.imul(salt, 0x3449f5);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function worldToLocal(wx: number, wz: number, cx: number, cz: number): { lx: number; lz: number } | null {
  const lx = wx - cx * CHUNK_SIZE;
  const lz = wz - cz * CHUNK_SIZE;
  if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return null;
  return { lx, lz };
}

function setWorldBlock(
  chunk: ChunkData,
  cx: number,
  cz: number,
  wx: number,
  y: number,
  wz: number,
  blockId: BlockId,
): void {
  if (y < 0 || y >= WORLD_HEIGHT) return;
  const local = worldToLocal(wx, wz, cx, cz);
  if (!local) return;
  chunk[local.lx][y][local.lz] = blockId;
}

function mesaLayerBlock(relativeY: number, topY: number, wx: number, wz: number): BlockId {
  if (relativeY >= topY - 1) return BLOCK_IDS.SAND;
  const band = Math.floor(relativeY / 3) % 4;
  if (band === 2) return BLOCK_IDS.NETHERRACK;
  return hashUnit(wx, wz, relativeY) > 0.9 ? BLOCK_IDS.NETHERRACK : BLOCK_IDS.SOUL_SAND;
}

function placeMesaFormation(
  chunk: ChunkData,
  cx: number,
  cz: number,
  formation: MesaFormation,
): void {
  const baseY = getTerrainHeight(formation.x, formation.z);
  const minX = Math.floor(formation.x - formation.radiusX - 2);
  const maxX = Math.ceil(formation.x + formation.radiusX + 2);
  const minZ = Math.floor(formation.z - formation.radiusZ - 2);
  const maxZ = Math.ceil(formation.z + formation.radiusZ + 2);

  for (let wx = minX; wx <= maxX; wx++) {
    for (let wz = minZ; wz <= maxZ; wz++) {
      const local = worldToLocal(wx, wz, cx, cz);
      if (!local) continue;

      const edgeNoise = (hashUnit(wx, wz, 19) - 0.5) * 0.12;
      const dx = (wx - formation.x) / formation.radiusX;
      const dz = (wz - formation.z) / formation.radiusZ;
      const distance = Math.hypot(dx, dz) + edgeNoise;
      if (distance > 1) continue;

      const profile = Math.max(0, 1 - distance);
      const terrace = Math.max(1, Math.ceil(profile * formation.terraces));
      const height = Math.max(3, Math.round((terrace / formation.terraces) * formation.height));
      const surfaceY = getTerrainHeight(wx, wz);
      const topY = Math.min(WORLD_HEIGHT - 8, Math.max(surfaceY + 2, baseY + height));

      for (let y = surfaceY; y <= topY; y++) {
        setWorldBlock(
          chunk,
          cx,
          cz,
          wx,
          y,
          wz,
          mesaLayerBlock(y - baseY, topY - baseY, wx, wz),
        );
      }
    }
  }
}

function distanceToStagePath(wx: number, wz: number): { distance: number; progress: number } {
  const startX = PLAYER_SPAWN.x;
  const startZ = PLAYER_SPAWN.z;
  const dx = STAGE_LANDMARK_CENTER.x - startX;
  const dz = STAGE_LANDMARK_CENTER.z - startZ;
  const lengthSquared = dx * dx + dz * dz;
  const progress = Math.max(0, Math.min(1, ((wx - startX) * dx + (wz - startZ) * dz) / lengthSquared));
  const nearestX = startX + dx * progress;
  const nearestZ = startZ + dz * progress;
  return { distance: Math.hypot(wx - nearestX, wz - nearestZ), progress };
}

function placeSandstonePath(chunk: ChunkData, cx: number, cz: number): void {
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = cx * CHUNK_SIZE + lx;
      const wz = cz * CHUNK_SIZE + lz;
      const { distance, progress } = distanceToStagePath(wx, wz);
      const width = 1.7 + Math.sin(progress * Math.PI) * 0.9;
      if (progress <= 0.05 || progress >= 0.92 || distance > width) continue;
      const y = getTerrainHeight(wx, wz);
      const pattern = (wx * 3 + wz * 5) % 11;
      chunk[lx][y][lz] = pattern === 0
        ? BLOCK_IDS.NETHERRACK
        : pattern <= 3
          ? BLOCK_IDS.SOUL_SAND
          : BLOCK_IDS.SAND;
    }
  }
}

function placeOasis(chunk: ChunkData, cx: number, cz: number): void {
  // 遠景からも水面が読めるよう、中心地表と同じ高さへ揃える。
  const waterY = Math.max(4, getTerrainHeight(OASIS_CENTER.x, OASIS_CENTER.z));
  const minX = Math.floor(OASIS_CENTER.x - OASIS_RADIUS_X - 2);
  const maxX = Math.ceil(OASIS_CENTER.x + OASIS_RADIUS_X + 2);
  const minZ = Math.floor(OASIS_CENTER.z - OASIS_RADIUS_Z - 2);
  const maxZ = Math.ceil(OASIS_CENTER.z + OASIS_RADIUS_Z + 2);

  for (let wx = minX; wx <= maxX; wx++) {
    for (let wz = minZ; wz <= maxZ; wz++) {
      const local = worldToLocal(wx, wz, cx, cz);
      if (!local) continue;
      const dx = (wx - OASIS_CENTER.x) / OASIS_RADIUS_X;
      const dz = (wz - OASIS_CENTER.z) / OASIS_RADIUS_Z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1.08) continue;

      if (distance <= 0.82) {
        const surfaceY = getTerrainHeight(wx, wz);
        const clearTop = Math.min(WORLD_HEIGHT - 1, Math.max(surfaceY + 7, waterY + 5));
        for (let y = waterY; y <= clearTop; y++) {
          chunk[local.lx][y][local.lz] = BLOCK_IDS.AIR;
        }
        chunk[local.lx][waterY - 1][local.lz] = hashUnit(wx, wz, 43) > 0.72
          ? BLOCK_IDS.SOUL_SAND
          : BLOCK_IDS.SAND;
        chunk[local.lx][waterY][local.lz] = BLOCK_IDS.WATER;
      } else {
        const y = getTerrainHeight(wx, wz);
        chunk[local.lx][y][local.lz] = distance > 0.98 ? BLOCK_IDS.SOUL_SAND : BLOCK_IDS.SAND;
      }
    }
  }
}

function placeHeroCactus(
  chunk: ChunkData,
  cx: number,
  cz: number,
  wx: number,
  wz: number,
  height: number,
  armDirection: number,
): void {
  const local = worldToLocal(wx, wz, cx, cz);
  if (!local) return;
  const baseY = getTerrainHeight(wx, wz);
  for (let y = 1; y <= height; y++) {
    setWorldBlock(chunk, cx, cz, wx, baseY + y, wz, BLOCK_IDS.LEAVES);
  }

  const armY = baseY + Math.max(3, height - 2);
  for (let step = 1; step <= 2; step++) {
    setWorldBlock(chunk, cx, cz, wx + armDirection * step, armY, wz, BLOCK_IDS.LEAVES);
  }
  setWorldBlock(chunk, cx, cz, wx + armDirection * 2, armY + 1, wz, BLOCK_IDS.LEAVES);
  if (height >= 6) {
    setWorldBlock(chunk, cx, cz, wx, armY - 1, wz - armDirection, BLOCK_IDS.LEAVES);
    setWorldBlock(chunk, cx, cz, wx, armY, wz - armDirection, BLOCK_IDS.LEAVES);
  }
}

/** 砂漠決戦だけへ、遠景の色層と中景の物語を追加する。 */
export function placeDesertCinematicScenery(chunk: ChunkData, cx: number, cz: number): void {
  const stage = getCurrentTerrainStage();
  if (stage?.id !== 'war-desert') return;

  for (const formation of MESA_FORMATIONS) {
    placeMesaFormation(chunk, cx, cz, formation);
  }
  placeSandstonePath(chunk, cx, cz);
  placeOasis(chunk, cx, cz);
  for (const cactus of HERO_CACTI) {
    placeHeroCactus(chunk, cx, cz, cactus.x, cactus.z, cactus.height, cactus.arm);
  }
}
