// 水ブロックの描画コンポーネント
// 水面の波アニメーション + 半透明マテリアルで臨場感を出す
// InstancedMesh を使用して大量の水ブロックを効率的に描画

import { useMemo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';

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

/** 水ブロックの InstancedMesh 描画 */
export function WaterRenderer() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(createWaterMaterial());
  const dummyRef = useRef(new THREE.Object3D());

  // 全チャンクから水ブロック位置を収集
  const chunks = useWorldStore((s) => s.chunks);
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);

  const waterPositions = useMemo(() => {
    const positions: number[] = [];

    chunks.forEach((chunk, key) => {
      const [cx, cz] = key.split(',').map(Number);
      const baseX = cx * CHUNK_SIZE;
      const baseZ = cz * CHUNK_SIZE;

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
            if (chunk[lx][ly][lz] === BLOCK_IDS.WATER) {
              // 水面のみ描画（上に水がなければ水面）
              const above = ly + 1 < WORLD_HEIGHT ? chunk[lx][ly + 1][lz] : BLOCK_IDS.AIR;
              if (above !== BLOCK_IDS.WATER) {
                positions.push(baseX + lx, ly, baseZ + lz);
              }
            }
          }
        }
      }
    });

    return new Float32Array(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, blockIndexVersion]);

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

  // 毎フレーム time uniform を更新（波アニメーション）
  useFrame((_, delta) => {
    materialRef.current.uniforms.uTime.value += delta;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[waterGeometry, materialRef.current, count]}
      renderOrder={100}
      frustumCulled={false}
    />
  );
}
