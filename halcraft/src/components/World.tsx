// 地形チャンクレンダリングコンポーネント
// ブロックデータを InstancedMesh で効率的に描画する
// カメラ距離ベースのチャンクカリングで描画負荷を大幅削減
// 段階的チャンク生成で初期ロードの体験を改善

import { useMemo, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE, type BlockId, type BlockInfo } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { isBlockExposed } from '../utils/terrain/blockExposure';
import { getPerformanceProfile } from '../utils/performance';

/** テクスチャキャッシュ（コンポーネント外で管理） */
const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

function getBlockTexture(textureName: string): THREE.Texture {
  if (textureCache.has(textureName)) return textureCache.get(textureName)!;

  const texture = textureLoader.load(`/textures/blocks/${textureName}`);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  textureCache.set(textureName, texture);
  return texture;
}

/** マテリアルキャッシュ（ブロック定義のテクスチャ名をキーにキャッシュ） */
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const faceMaterialCache = new Map<string, THREE.MeshStandardMaterial[]>();

/** 共有boxGeometry（全InstancedMeshで再利用） */
const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
const _blockTintColor = new THREE.Color();

function hashUnit(x: number, y: number, z: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 19.193) * 43758.5453;
  return value - Math.floor(value);
}

function isMetallicBlock(blockId: BlockId): boolean {
  return blockId === BLOCK_IDS.IRON
    || blockId === BLOCK_IDS.IRON_CRACKED
    || blockId === BLOCK_IDS.IRON_MOSSY
    || blockId === BLOCK_IDS.IRON_INGOT
    || blockId === BLOCK_IDS.GOLD_INGOT;
}

function isGemBlock(blockId: BlockId): boolean {
  return blockId === BLOCK_IDS.DIAMOND_GEM
    || blockId === BLOCK_IDS.DIAMOND_ORE
    || blockId === BLOCK_IDS.GOLD_ORE;
}

function getMaterialProps(blockDef: BlockInfo): THREE.MeshStandardMaterialParameters {
  const isMetallic = isMetallicBlock(blockDef.id);
  const isGem = isGemBlock(blockDef.id);
  const isGlass = blockDef.id === BLOCK_IDS.GLASS || blockDef.id === BLOCK_IDS.NETHER_PORTAL;
  const props: THREE.MeshStandardMaterialParameters = {
    transparent: blockDef.transparent,
    opacity: blockDef.transparent ? (isGlass ? 0.56 : 0.68) : 1,
    roughness: isMetallic ? 0.34 : isGem ? 0.42 : isGlass ? 0.08 : 0.82,
    metalness: isMetallic ? 0.56 : isGem ? 0.14 : 0,
    envMapIntensity: isGlass || isMetallic || isGem ? 0.55 : 0.18,
    vertexColors: true,
  };
  if (blockDef.transparent) {
    // InstancedMesh は個体ソートできないため、depthWrite を残して前後関係の破綻を抑える
    props.depthWrite = true;
    props.alphaTest = isGlass ? 0.02 : 0.08;
    props.depthTest = true;
  }
  if (blockDef.emissiveColor) {
    props.emissive = blockDef.emissiveColor;
    props.emissiveIntensity = blockDef.emissiveIntensity ?? 0.5;
  } else if (blockDef.emissive) {
    props.emissive = new THREE.Color(0x333333);
    props.emissiveIntensity = blockDef.emissiveIntensity ?? 0.5;
  }
  return props;
}

/** ブロックの角と面に薄い陰影を足し、平板な見え方を抑える */
function applyVoxelDepthShader(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if (mat.userData.halcraftVoxelDepthShader === true) return mat;

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHalcraftBlockLocalPosition;
varying vec3 vHalcraftBlockLocalNormal;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
vHalcraftBlockLocalNormal = objectNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vHalcraftBlockLocalPosition = transformed;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vHalcraftBlockLocalPosition;
varying vec3 vHalcraftBlockLocalNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 halcraftAbsPos = clamp(abs(vHalcraftBlockLocalPosition), vec3(0.0), vec3(0.5));
float halcraftNearX = smoothstep(0.39, 0.5, halcraftAbsPos.x);
float halcraftNearY = smoothstep(0.39, 0.5, halcraftAbsPos.y);
float halcraftNearZ = smoothstep(0.39, 0.5, halcraftAbsPos.z);
float halcraftEdgeShade = smoothstep(1.18, 1.9, halcraftNearX + halcraftNearY + halcraftNearZ);
float halcraftTopLift = max(vHalcraftBlockLocalNormal.y, 0.0) * 0.045;
float halcraftBottomShade = max(-vHalcraftBlockLocalNormal.y, 0.0) * 0.095;
float halcraftSideShade = (1.0 - abs(vHalcraftBlockLocalNormal.y)) * 0.025;
diffuseColor.rgb *= clamp(1.0 + halcraftTopLift - halcraftBottomShade - halcraftSideShade - halcraftEdgeShade * 0.075, 0.72, 1.12);`,
      );
  };
  mat.customProgramCacheKey = () => 'halcraft-voxel-depth-v1';
  mat.userData.halcraftVoxelDepthShader = true;
  return mat;
}

function getCachedMaterial(blockDef: BlockInfo): THREE.MeshStandardMaterial {
  // v2: 透過ブロックの depthWrite 修正をキャッシュに反映する
  const key = `v2:${blockDef.id}:${blockDef.texture}`;
  if (materialCache.has(key)) return materialCache.get(key)!;
  const mat = applyVoxelDepthShader(new THREE.MeshStandardMaterial({
    map: getBlockTexture(blockDef.texture),
    ...getMaterialProps(blockDef),
  }));
  materialCache.set(key, mat);
  return mat;
}

function getCachedFaceMaterials(blockDef: BlockInfo): THREE.MeshStandardMaterial[] | null {
  if (!blockDef.faceTextures) return null;
  const key = `v2:${blockDef.id}:${blockDef.faceTextures.top}_${blockDef.faceTextures.side}_${blockDef.faceTextures.bottom}`;
  if (faceMaterialCache.has(key)) return faceMaterialCache.get(key)!;

  const { top, side, bottom } = blockDef.faceTextures;
  const topTex = getBlockTexture(top);
  const sideTex = getBlockTexture(side);
  const bottomTex = getBlockTexture(bottom);
  const props = getMaterialProps(blockDef);

  const mats = [
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: sideTex, ...props })),
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: sideTex, ...props })),
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: topTex, ...props })),
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: bottomTex, ...props })),
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: sideTex, ...props })),
    applyVoxelDepthShader(new THREE.MeshStandardMaterial({ map: sideTex, ...props })),
  ];
  faceMaterialCache.set(key, mats);
  return mats;
}

function getBlockInstanceTint(
  blockDef: BlockInfo,
  x: number,
  y: number,
  z: number,
  target: THREE.Color,
): THREE.Color {
  const noise = hashUnit(x, y, z, blockDef.id);
  const smallNoise = (noise - 0.5) * 0.09;
  const heightLift = THREE.MathUtils.clamp((y - 10) / (WORLD_HEIGHT - 10), 0, 1) * 0.055;
  const light = 0.96 + smallNoise + heightLift;

  switch (blockDef.id) {
    case BLOCK_IDS.GRASS:
    case BLOCK_IDS.LEAVES:
      target.setRGB(0.92 + smallNoise * 0.5, 1.02 + heightLift, 0.88 + noise * 0.08);
      break;
    case BLOCK_IDS.WOOD:
    case BLOCK_IDS.RAW_WOOD:
    case BLOCK_IDS.CHEST:
      target.setRGB(1.04 + smallNoise, 0.96 + heightLift * 0.4, 0.84 + noise * 0.08);
      break;
    case BLOCK_IDS.SAND:
    case BLOCK_IDS.SOUL_SAND:
      target.setRGB(1.04 + heightLift, 0.98 + smallNoise, 0.84 + noise * 0.08);
      break;
    case BLOCK_IDS.SNOW:
      target.setRGB(0.93 + smallNoise * 0.4, 0.99 + heightLift, 1.07 + noise * 0.05);
      break;
    case BLOCK_IDS.GLASS:
      target.setRGB(0.88 + heightLift, 1.04, 1.12 + noise * 0.04);
      break;
    case BLOCK_IDS.IRON:
    case BLOCK_IDS.IRON_CRACKED:
    case BLOCK_IDS.IRON_MOSSY:
    case BLOCK_IDS.IRON_INGOT:
      target.setRGB(0.94 + heightLift, 0.97 + noise * 0.04, 1.03 + smallNoise);
      break;
    case BLOCK_IDS.GOLD_INGOT:
    case BLOCK_IDS.GOLD_ORE:
      target.setRGB(1.12 + heightLift, 1.0 + noise * 0.05, 0.72 + smallNoise);
      break;
    case BLOCK_IDS.DIAMOND_GEM:
    case BLOCK_IDS.DIAMOND_ORE:
    case BLOCK_IDS.ELECTRIC:
      target.setRGB(0.86 + heightLift, 1.06 + noise * 0.04, 1.12 + smallNoise);
      break;
    case BLOCK_IDS.LAVA:
    case BLOCK_IDS.GLOWSTONE:
    case BLOCK_IDS.ENCHANT:
    case BLOCK_IDS.CORE:
    case BLOCK_IDS.NETHER_PORTAL:
    case BLOCK_IDS.SPAWNER:
      target.setRGB(1.04 + heightLift, 1.02 + noise * 0.04, 1.0 + smallNoise);
      break;
    default:
      if (blockDef.blockCategory === 'stone' || blockDef.blockCategory === 'ore') {
        target.setRGB(0.94 + heightLift, 0.96 + smallNoise, 1.0 + noise * 0.035);
      } else if (blockDef.blockCategory === 'dirt') {
        target.setRGB(1.02 + smallNoise, 0.95 + heightLift * 0.35, 0.86 + noise * 0.04);
      } else {
        target.setScalar(light);
      }
  }

  return target;
}

interface ChunkRendererProps {
  cx: number;
  cz: number;
  castBlockShadows: boolean;
}

/** 1チャンク分のブロックを描画するコンポーネント */
function ChunkRenderer({ cx, cz, castBlockShadows }: ChunkRendererProps) {
  const getChunk = useWorldStore((s) => s.getChunk);
  const getBlock = useWorldStore((s) => s.getBlock);
  const version = useWorldStore((s) => s.chunkVersions.get(`${cx},${cz}`) ?? 0);
  // 隣接チャンク更新時も境界面の露出判定をやり直す
  const neighborVersionKey = useWorldStore((s) => (
    [
      s.chunkVersions.get(`${cx - 1},${cz}`) ?? 0,
      s.chunkVersions.get(`${cx + 1},${cz}`) ?? 0,
      s.chunkVersions.get(`${cx},${cz - 1}`) ?? 0,
      s.chunkVersions.get(`${cx},${cz + 1}`) ?? 0,
    ].join(',')
  ));

  const chunkData = getChunk(cx, cz);

  // ブロックタイプごとの描画データを計算（Float32Arrayで高速化）
  const blockGroups = useMemo(() => {
    if (!chunkData) return new Map<BlockId, Float32Array>();

    const exposureLookup = {
      chunkX: cx,
      chunkZ: cz,
      getWorldBlock: getBlock,
    };

    // まずカウントしてからTypedArrayを確保
    const counts = new Map<BlockId, number>();
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const blockId = chunkData[lx][ly][lz];
          if (blockId === BLOCK_IDS.AIR) continue;
          const blockDef = BLOCK_DEFS[blockId];
          if (blockDef?.isLiquid) continue;
          if (blockDef?.nonStandard) continue;
          if (!isBlockExposed(chunkData, lx, ly, lz, exposureLookup)) continue;
          counts.set(blockId, (counts.get(blockId) ?? 0) + 1);
        }
      }
    }

    const groups = new Map<BlockId, Float32Array>();
    const offsets = new Map<BlockId, number>();
    for (const [blockId, count] of counts) {
      groups.set(blockId, new Float32Array(count * 3));
      offsets.set(blockId, 0);
    }

    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const blockId = chunkData[lx][ly][lz];
          if (blockId === BLOCK_IDS.AIR) continue;
          const blockDef = BLOCK_DEFS[blockId];
          if (blockDef?.isLiquid) continue;
          if (blockDef?.nonStandard) continue;
          if (!isBlockExposed(chunkData, lx, ly, lz, exposureLookup)) continue;

          const arr = groups.get(blockId)!;
          const off = offsets.get(blockId)!;
          arr[off] = baseX + lx;
          arr[off + 1] = ly;
          arr[off + 2] = baseZ + lz;
          offsets.set(blockId, off + 3);
        }
      }
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkData, cx, cz, version, neighborVersionKey, getBlock]);

  if (!chunkData) return null;

  return (
    <group>
      {Array.from(blockGroups.entries()).map(([blockId, positionData]) => {
        const def = BLOCK_DEFS[blockId];
        if (!def || positionData.length === 0) return null;
        return (
          <BlockTypeInstances
            key={`${cx}-${cz}-${blockId}-${version}`}
            blockDef={def}
            positionData={positionData}
            castShadow={castBlockShadows}
          />
        );
      })}
    </group>
  );
}

/** 1ブロック種のインスタンスをまとめて描画（キャッシュ済みマテリアル使用） */
function BlockTypeInstances({
  blockDef,
  positionData,
  castShadow,
}: {
  blockDef: BlockInfo;
  positionData: Float32Array;
  castShadow: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummyRef = useRef(new THREE.Object3D());
  const faceMaterials = getCachedFaceMaterials(blockDef);
  const material = faceMaterials ?? getCachedMaterial(blockDef);
  const count = positionData.length / 3;

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = dummyRef.current;
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      dummy.position.set(positionData[off] + 0.5, positionData[off + 1] + 0.5, positionData[off + 2] + 0.5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      meshRef.current!.setColorAt(
        i,
        getBlockInstanceTint(blockDef, positionData[off], positionData[off + 1], positionData[off + 2], _blockTintColor),
      );
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [blockDef, positionData, count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedBoxGeometry, undefined, count]}
      material={material}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

/** ワールド全体の描画 */
export function World() {
  const initChunks = useWorldStore((s) => s.initChunks);
  const processChunkQueue = useWorldStore((s) => s.processChunkQueue);
  const processFluidSimulation = useWorldStore((s) => s.processFluidSimulation);
  const ensureChunksAround = useWorldStore((s) => s.ensureChunksAround);
  const { camera } = useThree();
  useSettingsStore((s) => s.graphicsPreset);
  useSettingsStore((s) => s.renderDistance);
  useSettingsStore((s) => s.shadowQuality);
  const performanceProfile = getPerformanceProfile();
  const visibleDistance = Math.min(RENDER_DISTANCE, performanceProfile.visibleChunkRadius);
  const initialRenderDistance = Math.min(RENDER_DISTANCE, performanceProfile.initialRenderDistance);
  const castBlockShadows = performanceProfile.shadowsEnabled && performanceProfile.tier === 'high';

  // カメラ位置からの可視チャンク（毎フレーム更新は重いので500msごと）
  const [visibleChunks, setVisibleChunks] = useState<[number, number][]>([]);
  const lastUpdateTime = useRef(0);
  const initialRenderDistanceRef = useRef(initialRenderDistance);

  // 初回マウント時にチャンクを生成
  useEffect(() => {
    initChunks(initialRenderDistanceRef.current);
  }, [initChunks]);

  // カメラ位置ベースで可視チャンクを更新 + 段階的チャンク生成
  const prevChunkKey = useRef('');

  useFrame(() => {
    // 段階的チャンク生成キューを毎フレーム処理
    processChunkQueue();
    processFluidSimulation();

    const now = performance.now();
    // 初回（lastUpdateTime === 0）は即座に実行、以降は500ms間隔
    if (lastUpdateTime.current !== 0 && now - lastUpdateTime.current < 500) return;
    lastUpdateTime.current = now;

    const camX = Math.floor(camera.position.x / CHUNK_SIZE);
    const camZ = Math.floor(camera.position.z / CHUNK_SIZE);

    // カメラ周辺の未生成チャンクを動的に生成
    ensureChunksAround(camX, camZ, visibleDistance);

    // 可視範囲のチャンクを収集
    const visible: [number, number][] = [];
    const keyParts: string[] = [];
    const currentChunks = useWorldStore.getState().chunks;
    currentChunks.forEach((_, key) => {
      const [cx, cz] = key.split(',').map(Number);
      const dx = Math.abs(cx - camX);
      const dz = Math.abs(cz - camZ);
      // チェビシェフ距離で判定（正方形の範囲）
      if (Math.max(dx, dz) <= visibleDistance) {
        visible.push([cx, cz]);
        keyParts.push(key);
      }
    });

    // 前回と同じ構成ならstateを更新しない（不要な再レンダリング防止）
    const newKey = keyParts.sort().join(';');
    if (newKey === prevChunkKey.current) return;
    prevChunkKey.current = newKey;

    // 新しい配列をstateにセット（参照共有を防ぐ）
    setVisibleChunks(visible);
  });

  return (
    <group>
      {visibleChunks.map(([cx, cz]) => (
        <ChunkRenderer key={`${cx},${cz}`} cx={cx} cz={cz} castBlockShadows={castBlockShadows} />
      ))}
    </group>
  );
}
