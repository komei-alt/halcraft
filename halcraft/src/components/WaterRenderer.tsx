// 水ブロックの描画コンポーネント
// 水面の波アニメーション + 半透明マテリアルで臨場感を出す
// InstancedMesh を使用して大量の水ブロックを効率的に描画

import { useMemo, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, RENDER_DISTANCE } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getPerformanceProfile } from '../utils/performance';

/** 水面シェーダーマテリアル（波アニメーション + 半透明） */
function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x1a5276) },
      uOpacity: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWave;

      void main() {
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;

        // 水面の波（上面の頂点のみ動かす）
        float wave = 0.0;
        if (position.y > 0.0) {
          wave = sin(worldPos.x * 1.5 + uTime * 1.2) * 0.04
               + sin(worldPos.z * 1.8 + uTime * 0.8) * 0.03
               + sin((worldPos.x + worldPos.z) * 0.8 + uTime * 1.5) * 0.02;
          worldPos.y += wave;
        }
        vWave = wave;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWave;

      void main() {
        // 深さによる色の変化（浅い = 明るい、深い = 暗い）
        float depth = clamp(vWorldPos.y / 10.0, 0.0, 1.0);
        vec3 shallowColor = vec3(0.15, 0.55, 0.75);
        vec3 deepColor = vec3(0.05, 0.2, 0.35);
        vec3 color = mix(deepColor, shallowColor, depth);

        // 波の頂点でハイライト
        float highlight = smoothstep(0.02, 0.06, vWave) * 0.15;
        color += highlight;

        // 時間で微妙にきらめき
        float sparkle = sin(vWorldPos.x * 8.0 + uTime * 3.0)
                       * sin(vWorldPos.z * 8.0 + uTime * 2.0) * 0.03;
        color += max(sparkle, 0.0);

        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
}

/** 共有boxGeometry（水ブロック用） */
const waterGeometry = new THREE.BoxGeometry(1, 1, 1);
const WATER_CENTER_UPDATE_INTERVAL_MS = 650;

/** 水ブロックの InstancedMesh 描画 */
export function WaterRenderer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastCenterUpdate = useRef(0);
  const material = useMemo(() => createWaterMaterial(), []);
  const { camera } = useThree();

  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);
  const getBlock = useWorldStore((s) => s.getBlock);
  useSettingsStore((s) => s.graphicsPreset);
  useSettingsStore((s) => s.renderDistance);
  const waterAnimation = useSettingsStore((s) => s.waterAnimation);
  const performanceProfile = getPerformanceProfile();
  const visibleDistance = Math.min(RENDER_DISTANCE, performanceProfile.visibleChunkRadius + 1);
  const [cameraChunk, setCameraChunk] = useState({ cx: 0, cz: 0 });

  const waterPositions = useMemo(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    const positions: number[] = [];
    const indexedWater = getIndexedBlockPositions(BLOCK_IDS.WATER);

    for (const pos of indexedWater) {
      const chunkX = Math.floor(pos.x / CHUNK_SIZE);
      const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
      if (Math.max(Math.abs(chunkX - cameraChunk.cx), Math.abs(chunkZ - cameraChunk.cz)) > visibleDistance) {
        continue;
      }

      // 空気に隣接する水ブロックのみ描画（埋もれた水は不要）
      const hasExposedFace =
        getBlock(pos.x, pos.y + 1, pos.z) !== BLOCK_IDS.WATER ||
        getBlock(pos.x, pos.y - 1, pos.z) === BLOCK_IDS.AIR ||
        getBlock(pos.x + 1, pos.y, pos.z) === BLOCK_IDS.AIR ||
        getBlock(pos.x - 1, pos.y, pos.z) === BLOCK_IDS.AIR ||
        getBlock(pos.x, pos.y, pos.z + 1) === BLOCK_IDS.AIR ||
        getBlock(pos.x, pos.y, pos.z - 1) === BLOCK_IDS.AIR;
      if (hasExposedFace) {
        positions.push(pos.x, pos.y, pos.z);
      }
    }

    return new Float32Array(positions);
  }, [blockIndexVersion, cameraChunk.cx, cameraChunk.cz, getBlock, getIndexedBlockPositions, visibleDistance]);

  const count = waterPositions.length / 3;

  // インスタンス行列を更新
  useEffect(() => {
    if (!meshRef.current || count === 0) return;
    const dummy = dummyRef.current;
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      dummy.position.set(
        waterPositions[off] + 0.5,
        waterPositions[off + 1] + 0.5,
        waterPositions[off + 2] + 0.5,
      );
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [waterPositions, count]);

  // 毎フレーム time uniform を更新（Three.js のマテリアル副作用）
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    const now = performance.now();
    if (now - lastCenterUpdate.current >= WATER_CENTER_UPDATE_INTERVAL_MS) {
      lastCenterUpdate.current = now;
      const nextCx = Math.floor(camera.position.x / CHUNK_SIZE);
      const nextCz = Math.floor(camera.position.z / CHUNK_SIZE);
      setCameraChunk((current) => (
        current.cx === nextCx && current.cz === nextCz
          ? current
          : { cx: nextCx, cz: nextCz }
      ));
    }

    if (!waterAnimation) return;
    const waterMaterial = meshRef.current?.material;
    if (waterMaterial instanceof THREE.ShaderMaterial) {
      waterMaterial.uniforms.uTime.value += delta;
    }
  });
  /* eslint-enable react-hooks/immutability */

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[waterGeometry, material, count]}
      renderOrder={100}
      frustumCulled={false}
    />
  );
}
