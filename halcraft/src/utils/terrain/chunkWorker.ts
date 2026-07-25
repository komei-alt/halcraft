/// <reference lib="webworker" />

import type { BiomeConfig } from '../../types/biomes';
import type { StageDefinition } from '../../types/stages';
import { setCurrentBiome } from './biomeConfig';
import { generateChunk } from './chunkGenerator';
import { setCurrentTerrainStage } from './stageConfig';
import { packChunkData } from './types';

export interface ChunkWorkerRequest {
  jobId: number;
  generation: number;
  cx: number;
  cz: number;
  biome: BiomeConfig;
  stage: StageDefinition | null;
}

export interface ChunkWorkerResponse {
  jobId: number;
  generation: number;
  cx: number;
  cz: number;
  maxFilledY: number;
  durationMs: number;
  buffer: ArrayBuffer;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<ChunkWorkerRequest>) => {
  const request = event.data;
  const startedAt = performance.now();
  setCurrentBiome(request.biome);
  setCurrentTerrainStage(request.stage);
  const chunk = generateChunk(request.cx, request.cz);
  const packed = packChunkData(chunk);
  const response: ChunkWorkerResponse = {
    jobId: request.jobId,
    generation: request.generation,
    cx: request.cx,
    cz: request.cz,
    maxFilledY: chunk.maxFilledY,
    durationMs: performance.now() - startedAt,
    buffer: packed.buffer as ArrayBuffer,
  };
  workerScope.postMessage(response, [response.buffer]);
};

export {};
