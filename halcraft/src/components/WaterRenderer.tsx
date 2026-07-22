// 水・溶岩ブロックの描画コンポーネント
// 流体専用シェーダーで、波・揺らぎ・発光をブロック描画から分離する
// InstancedMesh を使用して大量の流体ブロックを効率的に描画

import { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, RENDER_DISTANCE, type BlockId } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { isBlockTransparent } from '../utils/terrain/blockExposure';
import { getPerformanceProfile } from '../utils/performance';

/** 共通の霧付き頂点シェーダー（上面だけ波を乗せる） */
const LIQUID_VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  uniform float uTime;
  uniform float uWaveStrength;
  varying vec3 vWorldPos;
  varying float vWave;
  varying float vTopSurface;

  void main() {
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vTopSurface = smoothstep(0.32, 0.5, position.y);

    float wave = 0.0;
    if (position.y > 0.0 && uWaveStrength > 0.0) {
      wave = (
        sin(worldPos.x * 1.5 + uTime * 1.2) * 0.04
        + sin(worldPos.z * 1.8 + uTime * 0.8) * 0.03
        + sin((worldPos.x + worldPos.z) * 0.8 + uTime * 1.5) * 0.02
      ) * uWaveStrength;
      worldPos.y += wave;
    }
    vWave = wave;

    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`;

/** 水面シェーダーマテリアル（波アニメーション + 半透明 + シーン霧） */
function createWaterMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // 水中や水面下から見たときも面が消えないようにする
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x16758f) },
        uOpacity: { value: 0.55 },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.2).normalize() },
        uNightMix: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>

      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWave;
      varying float vTopSurface;
      varying vec3 vWorldNormal;

      void main() {
        vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vTopSurface = smoothstep(0.32, 0.5, position.y);
        vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);

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
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>

      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform float uNightMix;
      varying vec3 vWorldPos;
      varying float vWave;
      varying float vTopSurface;
      varying vec3 vWorldNormal;

      void main() {
        // 波の解析的な傾きから法線を作り、追加テクスチャなしで反射を出す
        float waveDx = cos(vWorldPos.x * 1.5 + uTime * 1.2) * 0.06
                     + cos((vWorldPos.x + vWorldPos.z) * 0.8 + uTime * 1.5) * 0.016;
        float waveDz = cos(vWorldPos.z * 1.8 + uTime * 0.8) * 0.054
                     + cos((vWorldPos.x + vWorldPos.z) * 0.8 + uTime * 1.5) * 0.016;
        vec3 waveNormal = normalize(vec3(-waveDx, 1.0, -waveDz));
        vec3 surfaceNormal = normalize(mix(vWorldNormal, waveNormal, vTopSurface));
        vec3 viewDirection = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - clamp(dot(surfaceNormal, viewDirection), 0.0, 1.0), 3.2);

        float heightTint = clamp((vWorldPos.y - 3.0) / 18.0, 0.0, 1.0);
        vec3 shallowColor = mix(uColor, vec3(0.24, 0.78, 0.9), 0.58);
        vec3 deepColor = uColor * 0.48;
        vec3 color = mix(deepColor, shallowColor, 0.34 + heightTint * 0.46);
        color = mix(color * 0.72, color, 0.72 + vTopSurface * 0.28);

        vec3 dayReflection = mix(vec3(0.32, 0.66, 0.88), vec3(0.82, 0.94, 1.0), max(surfaceNormal.y, 0.0));
        vec3 nightReflection = mix(vec3(0.025, 0.055, 0.13), vec3(0.18, 0.28, 0.52), max(surfaceNormal.y, 0.0));
        vec3 reflectionColor = mix(dayReflection, nightReflection, uNightMix);
        color = mix(color, reflectionColor, fresnel * (0.42 + vTopSurface * 0.34));

        vec3 reflectedSun = reflect(-normalize(uSunDirection), surfaceNormal);
        float sunSpecular = pow(max(dot(reflectedSun, viewDirection), 0.0), 92.0)
                          * (1.0 - uNightMix * 0.72)
                          * vTopSurface;
        color += vec3(1.0, 0.86, 0.58) * sunSpecular * 1.35;

        // 波の頂点でハイライト
        float highlight = smoothstep(0.02, 0.06, vWave) * 0.16 * vTopSurface;
        color += highlight;

        float sparkle = sin(vWorldPos.x * 8.0 + uTime * 3.0)
                       * sin(vWorldPos.z * 8.0 + uTime * 2.0) * 0.03;
        float causticA = sin(vWorldPos.x * 5.2 + vWorldPos.z * 1.8 + uTime * 1.25) * 0.5 + 0.5;
        float causticB = sin(vWorldPos.z * 6.1 - vWorldPos.x * 1.2 - uTime * 1.05) * 0.5 + 0.5;
        float caustic = pow(max(causticA * causticB - 0.52, 0.0), 2.0) * 0.36 * vTopSurface;
        float whiteRibbon = smoothstep(0.86, 1.0, sin((vWorldPos.x + vWorldPos.z) * 2.4 + uTime * 0.85) * 0.5 + 0.5)
                          * smoothstep(0.0, 0.045, abs(vWave))
                          * 0.08
                          * vTopSurface;
        color += max(sparkle, 0.0) * (0.65 + vTopSurface * 0.9);
        color += vec3(0.42, 0.95, 1.0) * caustic;
        color += vec3(0.78, 1.0, 0.95) * whiteRibbon;

        float alpha = clamp(uOpacity * (0.9 + vTopSurface * 0.1) + fresnel * 0.14, 0.42, 0.76);
        gl_FragColor = vec4(color, alpha);
        #include <fog_fragment>
      }
    `,
  });
  // 溶岩と同様、ポストFXのトーンマップで色が潰れないようにする
  material.toneMapped = false;
  return material;
}

/**
 * 流体が「空気・透明・別ブロック」に触れて露出しているか。
 * 注意: `above !== blockId` だけでは固体の下の溶岩まで描画してしまい、
 * 地面が透けてマグマが見える原因になる。固体に完全に囲まれた流体は描かない。
 */
function isLiquidBlockExposed(
  getBlock: (x: number, y: number, z: number) => BlockId,
  x: number,
  y: number,
  z: number,
  blockId: BlockId,
): boolean {
  const neighbors: BlockId[] = [
    getBlock(x, y + 1, z),
    getBlock(x, y - 1, z),
    getBlock(x + 1, y, z),
    getBlock(x - 1, y, z),
    getBlock(x, y, z + 1),
    getBlock(x, y, z - 1),
  ];
  for (const neighbor of neighbors) {
    if (neighbor === blockId) continue;
    // 空気・ガラス・非標準・別流体に接していれば露出
    if (isBlockTransparent(neighbor)) return true;
  }
  return false;
}

/** 溶岩シェーダーマテリアル（発光 + 熱ゆらぎ + 表面の割れ目） */
function createLavaMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    // 溶岩は不透明。深度を書いて地面を突き抜けない
    transparent: false,
    depthWrite: true,
    depthTest: true,
    // 地形面の“手前”へ押し出さない（+方向で地形の奥へ寄せ、透けを防ぐ）
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.FrontSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        // 波で上面が地面ブロックへ食い込むと透けに見えるため弱める
        uWaveStrength: { value: 0.22 },
        uOpacity: { value: 1 },
      },
    ]),
    vertexShader: LIQUID_VERTEX_SHADER,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>

      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vWorldPos;
      varying float vWave;
      varying float vTopSurface;

      void main() {
        float flowA = sin(vWorldPos.x * 3.4 + uTime * 1.8) * 0.5 + 0.5;
        float flowB = sin(vWorldPos.z * 4.2 - uTime * 1.25) * 0.5 + 0.5;
        float flowC = sin((vWorldPos.x + vWorldPos.z) * 2.1 + uTime * 2.45) * 0.5 + 0.5;
        float molten = clamp((flowA * 0.38) + (flowB * 0.34) + (flowC * 0.28), 0.0, 1.0);

        vec3 crustColor = vec3(0.28, 0.035, 0.01);
        vec3 lavaColor = vec3(0.92, 0.22, 0.02);
        vec3 hotCoreColor = vec3(0.95, 0.62, 0.1);

        float crackLine = smoothstep(0.64, 0.95, molten);
        float heatGlow = smoothstep(0.015, 0.055, vWave) * 0.28;
        vec3 color = mix(crustColor, lavaColor, 0.45 + molten * 0.45);
        color = mix(color, hotCoreColor, crackLine * 0.5 + heatGlow);

        float ember = sin(vWorldPos.x * 11.0 + uTime * 4.0)
                    * sin(vWorldPos.z * 9.0 - uTime * 3.2);
        color += max(ember, 0.0) * vec3(0.12, 0.05, 0.01);
        color *= 0.9 + vTopSurface * 0.1;
        // Bloom で地面を突き抜けて光らないよう輝度を抑える
        color = min(color, vec3(0.98, 0.72, 0.22));

        gl_FragColor = vec4(color, uOpacity);
        #include <fog_fragment>
      }
    `,
  });
  // ポストFXの Bloom が溶岩を過大に膨らませ、地面透けに見えるのを抑える
  material.toneMapped = true;
  return material;
}

/** 共有boxGeometry（流体ブロック用） */
const liquidGeometry = new THREE.BoxGeometry(1, 1, 1);
const LIQUID_CENTER_UPDATE_INTERVAL_MS = 650;

function getLiquidNightMix(gameTime: number, dimension: string): number {
  if (dimension === 'nether') return 0.9;
  if (gameTime < 0.05) return 1;
  if (gameTime < 0.1) return 1 - ((gameTime - 0.05) / 0.05);
  if (gameTime < 0.4) return 0;
  if (gameTime < 0.55) return (gameTime - 0.4) / 0.15;
  return 1;
}

interface LiquidRendererProps {
  blockId: BlockId;
  createMaterial: () => THREE.ShaderMaterial;
  renderOrder: number;
  visibleChunkPadding?: number;
  /** 地形面との共面チラつきを避けるためのわずかな縮小（溶岩向け） */
  instanceScale?: number;
}

/** 流体ブロックの InstancedMesh 描画 */
function LiquidRenderer({
  blockId,
  createMaterial,
  renderOrder,
  visibleChunkPadding = 1,
  instanceScale = 1,
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

      // 固体に完全に囲まれた流体は描かない（地下マグマの地面透け防止）
      if (!isLiquidBlockExposed(getBlock, pos.x, pos.y, pos.z, blockId)) {
        continue;
      }
      positions.push(pos.x, pos.y, pos.z);
    }

    return new Float32Array(positions);
  }, [blockId, blockIndexVersion, cameraChunk.cx, cameraChunk.cz, getBlock, getIndexedBlockPositions, visibleDistance]);

  const count = liquidPositions.length / 3;

  // 初回描画前に行列を入れる（原点に1フレーム固まるのを防ぐ）
  useLayoutEffect(() => {
    if (!meshRef.current || count === 0) return;
    const dummy = dummyRef.current;
    const scale = instanceScale;
    const isLava = blockId === BLOCK_IDS.LAVA;
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      const bx = liquidPositions[off];
      const by = liquidPositions[off + 1];
      const bz = liquidPositions[off + 2];
      // 溶岩の上に固体がある場合は上面を下げ、地面ブロックへ食い込まない
      let yScale = scale;
      let yCenter = by + 0.5;
      if (isLava) {
        const above = getBlock(bx, by + 1, bz);
        if (!isBlockTransparent(above)) {
          yScale = scale * 0.88;
          yCenter = by + 0.5 * yScale;
        }
      }
      dummy.position.set(bx + 0.5, yCenter, bz + 0.5);
      dummy.scale.set(scale, yScale, scale);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.visible = true;
  }, [blockId, getBlock, liquidPositions, count, instanceScale]);

  // マテリアル破棄
  useEffect(() => () => {
    material.dispose();
  }, [material]);

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

    const liquidMaterial = meshRef.current?.material;
    if (liquidMaterial instanceof THREE.ShaderMaterial) {
      if (liquidAnimation) {
        liquidMaterial.uniforms.uTime.value += delta;
      }

      const sunDirectionUniform = liquidMaterial.uniforms.uSunDirection;
      const nightMixUniform = liquidMaterial.uniforms.uNightMix;
      if (sunDirectionUniform && nightMixUniform) {
        const gameState = useGameStore.getState();
        const sunAngle = gameState.gameTime * Math.PI * 2;
        const sunDirection = sunDirectionUniform.value as THREE.Vector3;
        sunDirection.set(Math.cos(sunAngle), Math.max(0.16, Math.sin(sunAngle)), 0.38).normalize();
        nightMixUniform.value = getLiquidNightMix(gameState.gameTime, gameState.dimension);
      }
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
      visible={false}
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
      // 地形（renderOrder 0）より後でも depthTest で遮る。手前押しはしない
      renderOrder={0}
      visibleChunkPadding={2}
      // 地形面より内側へ縮め、隣接面の共面チラつきを防ぐ
      instanceScale={0.96}
    />
  );
}
