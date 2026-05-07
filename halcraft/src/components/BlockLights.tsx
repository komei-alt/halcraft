// ブロック光源コンポーネント（クラスタリング最適化版）
// 発光ブロック（電気、松明、エンチャント等）にポイントライトを配置
// 近接する光源をクラスタリングして PointLight 数を最小化
// パフォーマンスのため、プレイヤー近くの光源のみ描画

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, BLOCK_DEFS, type BlockId } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { getPerformanceProfile } from '../utils/performance';
/** 光源クラスタリングの統合距離（この距離内の光源は1つにまとめる） */
const CLUSTER_DISTANCE = 6;
/** クラスタリング距離の二乗 */
const CLUSTER_DISTANCE_SQ = CLUSTER_DISTANCE * CLUSTER_DISTANCE;
/** 光源の更新インターバル（秒） */
const UPDATE_INTERVAL = 0.5;

interface LightSource {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
}

/** クラスタリングされた光源 */
interface LightCluster {
  /** クラスタ中心 X */
  cx: number;
  /** クラスタ中心 Y */
  cy: number;
  /** クラスタ中心 Z */
  cz: number;
  /** クラスタ内の光源数 */
  count: number;
  /** 炎系光源を含むか */
  hasFlame: boolean;
  /** 代表する色（最も多い光源種別の色） */
  color: THREE.Color;
  /** 強度（光源数に応じてブースト） */
  intensity: number;
  /** 到達距離（光源数に応じて拡大） */
  distance: number;
}

/** 近接する光源をクラスタリングして PointLight 数を削減 */
function clusterLightSources(sources: LightSource[]): LightCluster[] {
  if (sources.length === 0) return [];

  const used = new Set<number>();
  const clusters: LightCluster[] = [];

  for (let i = 0; i < sources.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    const cluster: LightSource[] = [sources[i]];

    // 近い光源を同クラスタに統合
    for (let j = i + 1; j < sources.length; j++) {
      if (used.has(j)) continue;
      const dx = sources[j].x - sources[i].x;
      const dy = sources[j].y - sources[i].y;
      const dz = sources[j].z - sources[i].z;
      if (dx * dx + dy * dy + dz * dz < CLUSTER_DISTANCE_SQ) {
        cluster.push(sources[j]);
        used.add(j);
      }
    }

    // クラスタの中心を求める
    let sumX = 0, sumY = 0, sumZ = 0;
    let hasFlame = false;
    for (const s of cluster) {
      sumX += s.x;
      sumY += s.y;
      sumZ += s.z;
      if (
        s.blockId === BLOCK_IDS.TORCH ||
        s.blockId === BLOCK_IDS.CAMPFIRE ||
        s.blockId === BLOCK_IDS.CANDLE
      ) {
        hasFlame = true;
      }
    }
    const n = cluster.length;

    // 代表光源の色と強度を決定
    const primarySource = cluster[0];
    const def = BLOCK_DEFS[primarySource.blockId];
    const baseColor = def?.lightColor ?? new THREE.Color(0xffaa44);
    const baseIntensity = def?.lightIntensity ?? 2;
    const baseDistance = def?.lightDistance ?? 12;

    // クラスタ内の光源数に応じて強度と距離をブースト（線形ではなく緩やかに増加）
    const boostFactor = 1 + Math.log2(n) * 0.3;

    clusters.push({
      cx: sumX / n + 0.5,
      cy: sumY / n + 0.8,
      cz: sumZ / n + 0.5,
      count: n,
      hasFlame,
      color: baseColor,
      intensity: Math.min(baseIntensity * boostFactor, 6),
      distance: Math.min(baseDistance * boostFactor, 25),
    });
  }

  return clusters;
}

/** カメラ周辺のチャンクから発光ブロックを収集する（毎フレーム再計算を避けるためキャッシュ） */
function collectNearbyLightSources(): LightSource[] {
  return useWorldStore.getState().getIndexedLightBlockPositions();
}

/** ワールド内の発光ブロックをスキャンし、クラスタリングして PointLight を配置 */
export function BlockLights() {
  const performanceProfile = getPerformanceProfile();
  const maxLights = performanceProfile.maxDynamicLights;
  const lightCollectRangeSq = performanceProfile.lightCollectRange * performanceProfile.lightCollectRange;
  // 固定数の PointLight ref（プーリング方式で再利用）
  const lightsRef = useRef<(THREE.PointLight | null)[]>(
    Array.from({ length: maxLights }, () => null),
  );
  const lastUpdateTime = useRef(0);
  const activeClusters = useRef<LightCluster[]>([]);

  // 毎フレーム処理：クラスタ更新（スロットリング）+ 松明フリッカー
  useFrame(({ camera, clock }) => {
    const elapsed = clock.getElapsedTime();

    // クラスタリングとソートは UPDATE_INTERVAL ごとに実行
    if (elapsed - lastUpdateTime.current >= UPDATE_INTERVAL) {
      lastUpdateTime.current = elapsed;

      const cx = camera.position.x;
      const cy = camera.position.y;
      const cz = camera.position.z;

      // カメラ周辺のチャンクから光源を収集
      const allSources = collectNearbyLightSources();

      // プレイヤー近くの光源をフィルタ
      const nearSources = allSources.filter((s) => {
        const dx = s.x - cx;
        const dy = s.y - cy;
        const dz = s.z - cz;
        return dx * dx + dy * dy + dz * dz < lightCollectRangeSq;
      });

      // 距離でソート
      nearSources.sort((a, b) => {
        const da = (a.x - cx) ** 2 + (a.y - cy) ** 2 + (a.z - cz) ** 2;
        const db = (b.x - cx) ** 2 + (b.y - cy) ** 2 + (b.z - cz) ** 2;
        return da - db;
      });

      // クラスタリングして端末ごとの上限個数に
      const clusters = clusterLightSources(nearSources);
      activeClusters.current = clusters.slice(0, maxLights);
    }

    // ライトの位置・強度を更新
    const clusters = activeClusters.current;
    const t = elapsed;

    for (let i = 0; i < maxLights; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;

      if (i < clusters.length) {
        const cluster = clusters[i];
        light.visible = true;
        light.position.set(cluster.cx, cluster.cy, cluster.cz);
        light.color.copy(cluster.color);
        light.distance = cluster.distance;

        // 松明を含むクラスタにはフリッカーエフェクト
        if (cluster.hasFlame) {
          const flicker = Math.sin(t * 8 + i * 1.7) * 0.12 +
                          Math.sin(t * 13 + i * 2.3) * 0.08 +
                          Math.sin(t * 21 + i * 3.1) * 0.04;
          light.intensity = cluster.intensity + flicker * cluster.intensity;
        } else {
          light.intensity = cluster.intensity;
        }
      } else {
        // 使われていないライトは非表示
        light.visible = false;
      }
    }
  });

  return (
    <group>
      {/* 固定数の PointLight プール（再利用方式） */}
      {Array.from({ length: maxLights }, (_, i) => (
        <pointLight
          key={`block-light-${i}`}
          ref={(el) => { lightsRef.current[i] = el; }}
          intensity={0}
          distance={12}
          decay={2}
          castShadow={false}
          visible={false}
        />
      ))}
    </group>
  );
}
