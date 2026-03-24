// ブロック光源コンポーネント
// 発光ブロック（電気、松明、エンチャント等）にポイントライトを配置する
// パフォーマンスのため、プレイヤー近くの光源のみ描画

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';

/** 光源の最大同時描画数（パフォーマンス考慮） */
const MAX_LIGHTS = 16;

interface LightSource {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
}

/** ワールド内の発光ブロックをスキャンしてPointLightを配置 */
export function BlockLights() {
  const chunks = useWorldStore((s) => s.chunks);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);
  const cameraRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // カメラ位置を毎フレーム追跡
  useFrame(({ camera }) => {
    cameraRef.current.copy(camera.position);
  });

  // 全チャンクから発光ブロックを収集
  const allLightSources = useMemo(() => {
    const sources: LightSource[] = [];

    chunks.forEach((chunkData, key) => {
      const [cx, cz] = key.split(',').map(Number);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const blockId = chunkData[lx][ly][lz];
            if (blockId === BLOCK_IDS.AIR) continue;

            const def = BLOCK_DEFS[blockId];
            if (!def?.lightColor) continue;

            const worldX = cx * CHUNK_SIZE + lx;
            const worldZ = cz * CHUNK_SIZE + lz;

            sources.push({
              x: worldX,
              y: ly,
              z: worldZ,
              blockId,
            });
          }
        }
      }
    });

    return sources;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, chunkVersions]);

  return (
    <group>
      {allLightSources.slice(0, MAX_LIGHTS).map((source) => {
        const def = BLOCK_DEFS[source.blockId];
        if (!def?.lightColor) return null;

        return (
          <LightWithFlicker
            key={`light-${source.x}-${source.y}-${source.z}`}
            position={[source.x + 0.5, source.y + 0.8, source.z + 0.5]}
            color={def.lightColor}
            intensity={def.lightIntensity ?? 2}
            distance={def.lightDistance ?? 12}
            isTorch={source.blockId === BLOCK_IDS.TORCH}
          />
        );
      })}
    </group>
  );
}

/** ゆらゆら揺れるライト（松明用のフリッカーエフェクト） */
function LightWithFlicker({
  position,
  color,
  intensity,
  distance,
  isTorch,
}: {
  position: [number, number, number];
  color: THREE.Color;
  intensity: number;
  distance: number;
  isTorch: boolean;
}) {
  const lightRef = useRef<THREE.PointLight>(null);
  const baseIntensity = intensity;
  const timeOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (!lightRef.current) return;

    if (isTorch) {
      // 松明はゆらゆら揺れる炎のエフェクト
      const t = clock.getElapsedTime() + timeOffset;
      const flicker = Math.sin(t * 8) * 0.15 + Math.sin(t * 13) * 0.1 + Math.sin(t * 21) * 0.05;
      lightRef.current.intensity = baseIntensity + flicker * baseIntensity;
    }
  });

  return (
    <pointLight
      ref={lightRef}
      position={position}
      color={color}
      intensity={intensity}
      distance={distance}
      decay={2}
      castShadow={false}
    />
  );
}
