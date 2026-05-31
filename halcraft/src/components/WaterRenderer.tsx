// 水・溶岩ブロックの描画コンポーネント
// 流体専用シェーダーで、波・揺らぎ・発光をブロック描画から分離する
// InstancedMesh を使用して大量の流体ブロックを効率的に描画

import { useMemo, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, RENDER_DISTANCE, type BlockId } from '../types/blocks';
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

/** 溶岩シェーダーマテリアル（発光 + 熱ゆらぎ + 表面の割れ目） */
function createLavaMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.92 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vHeatWave;

      void main() {
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;

        float heatWave = 0.0;
        if (position.y > 0.0) {
          heatWave = sin(worldPos.x * 2.2 + uTime * 1.8) * 0.035
                   + sin(worldPos.z * 2.8 + uTime * 1.35) * 0.025
                   + sin((worldPos.x - worldPos.z) * 1.1 + uTime * 2.2) * 0.018;
          worldPos.y += heatWave;
        }
        vHeatWave = heatWave;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vHeatWave;

      void main() {
        float flowA = sin(vWorldPos.x * 3.4 + uTime * 1.8) * 0.5 + 0.5;
        float flowB = sin(vWorldPos.z * 4.2 - uTime * 1.25) * 0.5 + 0.5;
        float flowC = sin((vWorldPos.x + vWorldPos.z) * 2.1 + uTime * 2.45) * 0.5 + 0.5;
        float molten = clamp((flowA * 0.38) + (flowB * 0.34) + (flowC * 0.28), 0.0, 1.0);

        vec3 crustColor = vec3(0.28, 0.035, 0.01);
        vec3 lavaColor = vec3(1.0, 0.24, 0.025);
        vec3 hotCoreColor = vec3(1.0, 0.78, 0.12);

        float crackLine = smoothstep(0.64, 0.95, molten);
        float heatGlow = smoothstep(0.015, 0.055, vHeatWave) * 0.35;
        vec3 color = mix(crustColor, lavaColor, 0.45 + molten * 0.45);
        color = mix(color, hotCoreColor, crackLine * 0.58 + heatGlow);

        float ember = sin(vWorldPos.x * 11.0 + uTime * 4.0)
                    * sin(vWorldPos.z * 9.0 - uTime * 3.2);
        color += max(ember, 0.0) * vec3(0.18, 0.07, 0.015);

        gl_FragColor = vec4(color, uOpacity);
      }
    `,
  });
  material.toneMapped = false;
  return material;
}

/** 共有boxGeometry（流体ブロック用） */
const liquidGeometry = new THREE.BoxGeometry(1, 1, 1);
const LIQUID_CENTER_UPDATE_INTERVAL_MS = 650;

interface LiquidRendererProps {
  blockId: BlockId;
  createMaterial: () => THREE.ShaderMaterial;
  renderOrder: number;
  visibleChunkPadding?: number;
}

/** 流体ブロックの InstancedMesh 描画 */
function LiquidRenderer({
  blockId,
  createMaterial,
  renderOrder,
  visibleChunkPadding = 1,
}: LiquidRendererProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const lastCenterUpdate = useRef(0);
  const material = useMemo(() => createMaterial(), [createMaterial]);
  const { camera } = useThree();

  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);
  const getBlock = useWorldStore((s) => s.getBlock);
  useSettingsStore((s) => s.graphicsPreset);
  useSettingsStore((s) => s.renderDistance);
  const liquidAnimation = useSettingsStore((s) => s.waterAnimation);
  const performanceProfile = getPerformanceProfile();
  const visibleDistance = Math.min(RENDER_DISTANCE, performanceProfile.visibleChunkRadius + visibleChunkPadding);
  const [cameraChunk, setCameraChunk] = useState({ cx: 0, cz: 0 });

  const liquidPositions = useMemo(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    const positions: number[] = [];
    const indexedBlocks = getIndexedBlockPositions(blockId);

    for (const pos of indexedBlocks) {
      const chunkX = Math.floor(pos.x / CHUNK_SIZE);
      const chunkZ = Math.floor(pos.z / CHUNK_SIZE);
      if (Math.max(Math.abs(chunkX - cameraChunk.cx), Math.abs(chunkZ - cameraChunk.cz)) > visibleDistance) {
        continue;
      }

      // 空気や別ブロックに接する流体だけ描画し、埋もれた流体は省く
      const hasExposedFace =
        getBlock(pos.x, pos.y + 1, pos.z) !== blockId ||
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
  }, [blockId, blockIndexVersion, cameraChunk.cx, cameraChunk.cz, getBlock, getIndexedBlockPositions, visibleDistance]);

  const count = liquidPositions.length / 3;

  // インスタンス行列を更新
  useEffect(() => {
    if (!meshRef.current || count === 0) return;
    const dummy = dummyRef.current;
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      dummy.position.set(
        liquidPositions[off] + 0.5,
        liquidPositions[off + 1] + 0.5,
        liquidPositions[off + 2] + 0.5,
      );
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [liquidPositions, count]);

  // 毎フレーム time uniform を更新（Three.js のマテリアル副作用）
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    const now = performance.now();
    if (now - lastCenterUpdate.current >= LIQUID_CENTER_UPDATE_INTERVAL_MS) {
      lastCenterUpdate.current = now;
      const nextCx = Math.floor(camera.position.x / CHUNK_SIZE);
      const nextCz = Math.floor(camera.position.z / CHUNK_SIZE);
      setCameraChunk((current) => (
        current.cx === nextCx && current.cz === nextCz
          ? current
          : { cx: nextCx, cz: nextCz }
      ));
    }

    if (!liquidAnimation) return;
    const liquidMaterial = meshRef.current?.material;
    if (liquidMaterial instanceof THREE.ShaderMaterial) {
      liquidMaterial.uniforms.uTime.value += delta;
    }
  });
  /* eslint-enable react-hooks/immutability */

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[liquidGeometry, material, count]}
      renderOrder={renderOrder}
      frustumCulled={false}
    />
  );
}

/** 水ブロックの InstancedMesh 描画 */
export function WaterRenderer() {
  return (
    <LiquidRenderer
      blockId={BLOCK_IDS.WATER}
      createMaterial={createWaterMaterial}
      renderOrder={100}
    />
  );
}

/** 溶岩ブロックの InstancedMesh 描画 */
export function LavaRenderer() {
  return (
    <LiquidRenderer
      blockId={BLOCK_IDS.LAVA}
      createMaterial={createLavaMaterial}
      renderOrder={101}
      visibleChunkPadding={2}
    />
  );
}
