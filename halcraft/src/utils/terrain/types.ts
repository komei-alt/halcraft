// 地形モジュール共通型定義

import type { BlockId } from '../../types/blocks';

/** 1チャンク分のブロックデータ配列を返す */
export type ChunkData = BlockId[][][]; // [x][y][z]
