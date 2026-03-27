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
/** 光源を収集する最大距離 */
const LIGHT_COLLECT_RANGE = 30;

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
  const sortedLights = useRef<LightSource[]>([]);

  // カメラ位置を毎フレーム追跡し、光源をソート
  useFrame(({ camera }) => {
    cameraRef.current.copy(camera.position);
    // 毎フレームソートする必要はないが、光源リストが変わったらソート
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const sources = allLightSources;
    // 距離でソートして近い順にMAX_LIGHTS個取得
    sortedLights.current = sources
      .filter((s) => {
        const dx = s.x - cx;
        const dy = s.y - cy;
        const dz = s.z - cz;
        return dx * dx + dy * dy + dz * dz < LIGHT_COLLECT_RANGE * LIGHT_COLLECT_RANGE;
      })
      .sort((a, b) => {
        const da = (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2;
        const db = (b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2;
        return da - db;
      })
      .slice(0, MAX_LIGHTS);
  });

  // 全チャンクから発光ブロックを収集（チャンク変更時のみ再計算）
  const allLightSources = useMemo(() => {
    const sources: LightSource[] = [];

    chunks.forEach((chunkData, key) => {
      const [chunkCx, chunkCz] = key.split(',').map(Number);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const blockId = chunkData[lx][ly][lz];
            if (blockId === BLOCK_IDS.AIR) continue;

            const def = BLOCK_DEFS[blockId];
            if (!def?.lightColor) continue;

            sources.push({
              x: chunkCx * CHUNK_SIZE + lx,
              y: ly,
              z: chunkCz * CHUNK_SIZE + lz,
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
      {sortedLights.current.map((source) => {
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
  const timeOffsetRef = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (timeOffsetRef.current === null) {
      timeOffsetRef.current = Math.random() * Math.PI * 2;
    }
    if (!lightRef.current) return;

    if (isTorch) {
      // 松明はゆらゆら揺れる炎のエフェクト
      const t = clock.getElapsedTime() + timeOffsetRef.current;
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
