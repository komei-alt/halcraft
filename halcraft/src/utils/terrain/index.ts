// 地形モジュール — 公開API
// 既存の import { ... } from '../utils/terrain' の互換性を維持するバレル

export { getTerrainHeight } from './heightmap';
export { generateChunk } from './chunkGenerator';
export { isBlockExposed } from './blockExposure';
export { HELIPORT_CENTER, VILLAGE_CENTER } from './constants';
export type { ChunkData } from './types';
