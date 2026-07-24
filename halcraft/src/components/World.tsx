// ハルクラ・サーフェスメッシュレンダラー v2
// 露出した面だけをテクスチャアトラスへまとめ、チャンクごとの描画回数と三角形数を削減する。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BLOCK_DEFS,
  BLOCK_IDS,
  CHUNK_SIZE,
  RENDER_DISTANCE,
  WORLD_HEIGHT,
  type BlockId,
  type BlockInfo,
} from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getPerformanceProfile } from '../utils/performance';
import type { ChunkData } from '../utils/terrain/types';

type FaceTextureRole = 'top' | 'side' | 'bottom';
type MaterialLayer = 'opaque' | 'cutout' | 'polished' | 'emissive' | 'transparent';

interface AtlasSlot {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface TextureAtlas {
  texture: THREE.CanvasTexture;
  slots: Map<string, AtlasSlot>;
}

interface FaceDefinition {
  offset: readonly [number, number, number];
  normal: readonly [number, number, number];
  role: FaceTextureRole;
  corners: readonly (readonly [number, number, number])[];
}

interface LayerBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

interface ChunkMeshSet {
  geometries: Partial<Record<MaterialLayer, THREE.BufferGeometry>>;
  faceCount: number;
}

interface VisibleChunk {
  cx: number;
  cz: number;
  distance: number;
}

interface ChunkRendererProps extends VisibleChunk {
  materials: Record<MaterialLayer, THREE.MeshStandardMaterial>;
  atlas: TextureAtlas;
  castBlockShadows: boolean;
}

const FACE_DEFINITIONS: readonly FaceDefinition[] = [
  {
    offset: [1, 0, 0], normal: [1, 0, 0], role: 'side',
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  },
  {
    offset: [-1, 0, 0], normal: [-1, 0, 0], role: 'side',
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  },
  {
    offset: [0, 1, 0], normal: [0, 1, 0], role: 'top',
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  },
  {
    offset: [0, -1, 0], normal: [0, -1, 0], role: 'bottom',
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  },
  {
    offset: [0, 0, 1], normal: [0, 0, 1], role: 'side',
    corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  },
  {
    offset: [0, 0, -1], normal: [0, 0, -1], role: 'side',
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
  },
] as const;

const MATERIAL_LAYERS: readonly MaterialLayer[] = [
  'opaque',
  'cutout',
  'polished',
  'emissive',
  'transparent',
] as const;

const renderableBlockDefs = (Object.values(BLOCK_DEFS) as BlockInfo[]).filter((definition) =>
  definition.id !== BLOCK_IDS.AIR && !definition.isLiquid && !definition.nonStandard,
);

const atlasTextureNames = Array.from(new Set(renderableBlockDefs.flatMap((definition) => {
  if (!definition.faceTextures) return [definition.texture];
  return [
    definition.faceTextures.top,
    definition.faceTextures.side,
    definition.faceTextures.bottom,
  ];
}))).sort();

const atlasTextureUrls = atlasTextureNames.map((name) => `/textures/blocks/${name}`);
const atlasCellSize = 256;
const atlasPadding = 4;
const tintColor = new THREE.Color();

function createLayerBuffers(): LayerBuffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function getTextureForFace(definition: BlockInfo, role: FaceTextureRole): string {
  if (!definition.faceTextures) return definition.texture;
  return definition.faceTextures[role];
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

function getMaterialLayer(definition: BlockInfo): MaterialLayer {
  if (definition.id === BLOCK_IDS.LEAVES) return 'cutout';
  if (definition.id === BLOCK_IDS.GLASS || definition.transparent) return 'transparent';
  if (definition.emissive || definition.emissiveColor) return 'emissive';
  if (isMetallicBlock(definition.id) || isGemBlock(definition.id)) return 'polished';
  return 'opaque';
}

function isBlockTransparent(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return true;
  const definition = BLOCK_DEFS[blockId];
  // ガラス・非標準形状・流体は「透過」扱い。
  // 溶岩を不透明にすると隣接する地形の側面が落ち、ブロックが透けて
  // 下/横のマグマが見える描画バグになるため、流体は透過として残す。
  // 共面チラつきは LavaRenderer 側の縮小 + polygonOffset で抑える。
  return !definition
    || definition.transparent
    || Boolean(definition.nonStandard)
    || Boolean(definition.isLiquid);
}

function shouldRenderFace(blockId: BlockId, neighborId: BlockId): boolean {
  if (neighborId === BLOCK_IDS.AIR) return true;
  // 溶岩・水は World メッシュに乗らない。地形↔流体の境は必ず地形面を残す。
  // （流体を不透明扱いにすると地形側面が落ち、地面が透けてマグマが見える）
  const neighborDef = BLOCK_DEFS[neighborId];
  if (neighborDef?.isLiquid && !BLOCK_DEFS[blockId]?.isLiquid) return true;
  if (BLOCK_DEFS[blockId]?.isLiquid) return false;
  const selfTransparent = isBlockTransparent(blockId);
  const neighborTransparent = isBlockTransparent(neighborId);
  if (!selfTransparent && neighborTransparent) return true;
  return selfTransparent && neighborTransparent && neighborId !== blockId;
}

function hashUnit(x: number, y: number, z: number, salt: number): number {
  let hash = Math.imul(x | 0, 0x45d9f3b)
    ^ Math.imul(y | 0, 0x119de1f3)
    ^ Math.imul(z | 0, 0x3449f5)
    ^ Math.imul(salt | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function getBlockTint(
  definition: BlockInfo,
  worldX: number,
  y: number,
  worldZ: number,
): THREE.Color {
  const noise = hashUnit(worldX, y, worldZ, definition.id);
  const variation = (noise - 0.5) * 0.085;
  const heightLift = THREE.MathUtils.clamp((y - 10) / 82, 0, 1) * 0.045;

  switch (definition.id) {
    case BLOCK_IDS.GRASS:
    case BLOCK_IDS.LEAVES:
      return tintColor.setRGB(0.93 + variation * 0.45, 1.02 + heightLift, 0.9 + noise * 0.07);
    case BLOCK_IDS.WOOD:
    case BLOCK_IDS.RAW_WOOD:
    case BLOCK_IDS.CHEST:
      return tintColor.setRGB(1.04 + variation, 0.97 + heightLift * 0.35, 0.86 + noise * 0.07);
    case BLOCK_IDS.SAND:
      // 原画の砂粒を残したまま、夕日の下で砂岩らしい黄土色へ寄せる。
      return tintColor.setRGB(1.0 + heightLift * 0.35, 0.72 + variation * 0.28, 0.38 + noise * 0.06);
    case BLOCK_IDS.SOUL_SAND:
      return tintColor.setRGB(0.88 + heightLift * 0.25, 0.34 + variation * 0.2, 0.12 + noise * 0.04);
    case BLOCK_IDS.NETHERRACK:
      return tintColor.setRGB(1.0 + heightLift * 0.2, 0.88 + variation * 0.16, 0.72 + noise * 0.03);
    case BLOCK_IDS.SNOW:
      return tintColor.setRGB(0.95 + variation * 0.35, 1 + heightLift, 1.07 + noise * 0.04);
    case BLOCK_IDS.GLASS:
      return tintColor.setRGB(0.9 + heightLift, 1.04, 1.1 + noise * 0.04);
    case BLOCK_IDS.GOLD_INGOT:
    case BLOCK_IDS.GOLD_ORE:
      return tintColor.setRGB(1.1 + heightLift, 1 + noise * 0.05, 0.75 + variation);
    case BLOCK_IDS.DIAMOND_GEM:
    case BLOCK_IDS.DIAMOND_ORE:
    case BLOCK_IDS.ELECTRIC:
      return tintColor.setRGB(0.88 + heightLift, 1.06 + noise * 0.04, 1.1 + variation);
    default: {
      const light = 0.97 + variation + heightLift;
      return tintColor.setScalar(light);
    }
  }
}

function createTextureAtlas(textures: THREE.Texture[]): TextureAtlas {
  const requiredCells = Math.ceil(Math.sqrt(Math.max(1, textures.length)));
  const atlasSize = THREE.MathUtils.ceilPowerOfTwo(requiredCells * atlasCellSize);
  const columns = Math.floor(atlasSize / atlasCellSize);
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('ブロックテクスチャアトラスを作成できませんでした');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, atlasSize, atlasSize);

  const slots = new Map<string, AtlasSlot>();
  for (let index = 0; index < atlasTextureNames.length; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * atlasCellSize;
    const y = row * atlasCellSize;
    const size = atlasCellSize - atlasPadding * 2;
    const image = textures[index].image as CanvasImageSource;
    context.drawImage(image, x + atlasPadding, y + atlasPadding, size, size);

    slots.set(atlasTextureNames[index], {
      u0: (x + atlasPadding + 0.5) / atlasSize,
      u1: (x + atlasCellSize - atlasPadding - 0.5) / atlasSize,
      v0: 1 - (y + atlasCellSize - atlasPadding - 0.5) / atlasSize,
      v1: 1 - (y + atlasPadding + 0.5) / atlasSize,
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.name = 'HalCraft Block Atlas v2';
  return { texture, slots };
}

function createWorldMaterials(atlas: TextureAtlas): Record<MaterialLayer, THREE.MeshStandardMaterial> {
  const common: THREE.MeshStandardMaterialParameters = {
    map: atlas.texture,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0,
  };
  return {
    opaque: new THREE.MeshStandardMaterial(common),
    cutout: new THREE.MeshStandardMaterial({
      ...common,
      alphaTest: 0.28,
      side: THREE.DoubleSide,
    }),
    polished: new THREE.MeshStandardMaterial({
      ...common,
      roughness: 0.34,
      metalness: 0.38,
      envMapIntensity: 0.72,
    }),
    emissive: new THREE.MeshStandardMaterial({
      ...common,
      roughness: 0.48,
      emissive: new THREE.Color(0x6a4326),
      emissiveMap: atlas.texture,
      emissiveIntensity: 0.34,
    }),
    transparent: new THREE.MeshStandardMaterial({
      ...common,
      transparent: true,
      opacity: 0.7,
      roughness: 0.12,
      metalness: 0.05,
      envMapIntensity: 0.78,
      depthWrite: false,
      alphaTest: 0.025,
    }),
  };
}

function readWorldBlock(
  chunks: Map<string, ChunkData>,
  worldX: number,
  y: number,
  worldZ: number,
): BlockId {
  if (y < 0 || y >= WORLD_HEIGHT) return BLOCK_IDS.AIR;
  const cx = Math.floor(worldX / CHUNK_SIZE);
  const cz = Math.floor(worldZ / CHUNK_SIZE);
  const lx = ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const lz = ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunks.get(`${cx},${cz}`)?.[lx]?.[y]?.[lz] ?? BLOCK_IDS.AIR;
}

function appendFace(
  buffers: LayerBuffers,
  face: FaceDefinition,
  slot: AtlasSlot,
  lx: number,
  y: number,
  lz: number,
  tint: THREE.Color,
  vertexAo: readonly number[],
): void {
  const vertexOffset = buffers.positions.length / 3;
  const faceLight = face.normal[1] > 0.5
    ? 1
    : face.normal[1] < -0.5
      ? 0.58
      : face.normal[0] > 0.5
        ? 0.86
        : face.normal[0] < -0.5
          ? 0.72
          : face.normal[2] > 0.5
            ? 0.8
            : 0.68;
  const faceUvs = [
    [slot.u0, slot.v0],
    [slot.u0, slot.v1],
    [slot.u1, slot.v1],
    [slot.u1, slot.v0],
  ] as const;

  for (let index = 0; index < 4; index++) {
    const corner = face.corners[index];
    buffers.positions.push(lx + corner[0], y + corner[1], lz + corner[2]);
    buffers.normals.push(face.normal[0], face.normal[1], face.normal[2]);
    buffers.uvs.push(faceUvs[index][0], faceUvs[index][1]);
    const light = faceLight * vertexAo[index];
    buffers.colors.push(tint.r * light, tint.g * light, tint.b * light);
  }

  buffers.indices.push(
    vertexOffset,
    vertexOffset + 1,
    vertexOffset + 2,
    vertexOffset,
    vertexOffset + 2,
    vertexOffset + 3,
  );
}

function isAoOccluder(blockId: BlockId): boolean {
  if (blockId === BLOCK_IDS.AIR) return false;
  const definition = BLOCK_DEFS[blockId];
  return Boolean(definition && !definition.transparent && !definition.isLiquid && !definition.nonStandard);
}

/**
 * 面の4頂点ごとに周囲3セルを調べる軽量ボクセルAO。
 * ポストFXを強くしなくても、段丘・ピラミッド・サボテンの接合部に奥行きが出る。
 */
function getFaceVertexAo(
  chunks: Map<string, ChunkData>,
  face: FaceDefinition,
  worldX: number,
  y: number,
  worldZ: number,
): readonly number[] {
  const normal = face.normal;
  const tangentAxes = [0, 1, 2].filter((axis) => normal[axis] === 0);
  const origin = [worldX + normal[0], y + normal[1], worldZ + normal[2]];

  return face.corners.map((corner) => {
    const axisA = tangentAxes[0];
    const axisB = tangentAxes[1];
    const signA = corner[axisA] === 0 ? -1 : 1;
    const signB = corner[axisB] === 0 ? -1 : 1;
    const sideA = [...origin];
    const sideB = [...origin];
    const diagonal = [...origin];
    sideA[axisA] += signA;
    sideB[axisB] += signB;
    diagonal[axisA] += signA;
    diagonal[axisB] += signB;

    const occupiedA = isAoOccluder(readWorldBlock(chunks, sideA[0], sideA[1], sideA[2]));
    const occupiedB = isAoOccluder(readWorldBlock(chunks, sideB[0], sideB[1], sideB[2]));
    const occupiedDiagonal = isAoOccluder(readWorldBlock(chunks, diagonal[0], diagonal[1], diagonal[2]));
    if (occupiedA && occupiedB) return 0.52;
    const occlusion = Number(occupiedA) + Number(occupiedB) + Number(occupiedDiagonal);
    return 1 - occlusion * 0.13;
  });
}

function buildChunkMeshes(
  chunk: ChunkData,
  cx: number,
  cz: number,
  atlas: TextureAtlas,
): ChunkMeshSet {
  const layerBuffers: Record<MaterialLayer, LayerBuffers> = {
    opaque: createLayerBuffers(),
    cutout: createLayerBuffers(),
    polished: createLayerBuffers(),
    emissive: createLayerBuffers(),
    transparent: createLayerBuffers(),
  };
  const chunks = useWorldStore.getState().chunks;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  const maxY = Math.min(WORLD_HEIGHT - 1, chunk.maxFilledY + 1);
  let faceCount = 0;

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let y = 0; y <= maxY; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const blockId = chunk[lx][y][lz];
        if (blockId === BLOCK_IDS.AIR) continue;
        const definition = BLOCK_DEFS[blockId];
        if (!definition || definition.isLiquid || definition.nonStandard) continue;

        const layer = getMaterialLayer(definition);
        const buffers = layerBuffers[layer];
        const worldX = baseX + lx;
        const worldZ = baseZ + lz;
        const tint = getBlockTint(definition, worldX, y, worldZ);

        for (const face of FACE_DEFINITIONS) {
          const nx = lx + face.offset[0];
          const ny = y + face.offset[1];
          const nz = lz + face.offset[2];
          const neighborId = nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE
            ? (ny >= 0 && ny < WORLD_HEIGHT ? chunk[nx][ny][nz] : BLOCK_IDS.AIR)
            : readWorldBlock(chunks, worldX + face.offset[0], ny, worldZ + face.offset[2]);
          if (!shouldRenderFace(blockId, neighborId)) continue;

          const textureName = getTextureForFace(definition, face.role);
          const slot = atlas.slots.get(textureName);
          if (!slot) continue;
          const vertexAo = getFaceVertexAo(chunks, face, worldX, y, worldZ);
          appendFace(buffers, face, slot, lx, y, lz, tint, vertexAo);
          faceCount++;
        }
      }
    }
  }

  const geometries: Partial<Record<MaterialLayer, THREE.BufferGeometry>> = {};
  for (const layer of MATERIAL_LAYERS) {
    const buffers = layerBuffers[layer];
    if (buffers.indices.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3));
    geometry.setIndex(buffers.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometries[layer] = geometry;
  }

  return { geometries, faceCount };
}

function getNeighborMeshSignature(cx: number, cz: number): string {
  const state = useWorldStore.getState();
  return [
    [cx, cz],
    [cx - 1, cz],
    [cx + 1, cz],
    [cx, cz - 1],
    [cx, cz + 1],
  ].map(([nx, nz]) => {
    const key = `${nx},${nz}`;
    return `${state.chunks.has(key) ? 1 : 0}.${state.chunkVersions.get(key) ?? 0}`;
  }).join(':');
}

function ChunkRenderer({
  cx,
  cz,
  distance,
  materials,
  atlas,
  castBlockShadows,
}: ChunkRendererProps) {
  const chunkKey = `${cx},${cz}`;
  const chunk = useWorldStore((state) => state.chunks.get(chunkKey));
  const meshSignature = useWorldStore(() => getNeighborMeshSignature(cx, cz));
  const meshSet = useMemo(() => {
    if (!chunk || meshSignature.length === 0) return null;
    return buildChunkMeshes(chunk, cx, cz, atlas);
  }, [atlas, chunk, cx, cz, meshSignature]);

  useEffect(() => () => {
    if (!meshSet) return;
    Object.values(meshSet.geometries).forEach((geometry) => geometry.dispose());
  }, [meshSet]);

  if (!meshSet) return null;
  // 近距離だけ影の描画パスへ入れ、立体感とフレームレートを両立する。
  const castsShadow = castBlockShadows && distance <= 2.75;

  return (
    <group position={[cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE]}>
      {MATERIAL_LAYERS.map((layer) => {
        const geometry = meshSet.geometries[layer];
        if (!geometry) return null;
        return (
          <mesh
            key={layer}
            geometry={geometry}
            material={materials[layer]}
            castShadow={castsShadow && layer !== 'transparent'}
            receiveShadow={layer !== 'transparent'}
            renderOrder={layer === 'transparent' ? 2 : 0}
          />
        );
      })}
    </group>
  );
}

/** ワールド全体を、距離順の円形チャンクストリーミングで描画する。 */
export function World() {
  const loadedTextures = useLoader(THREE.TextureLoader, atlasTextureUrls);
  const atlas = useMemo(() => createTextureAtlas(loadedTextures), [loadedTextures]);
  const materials = useMemo(() => createWorldMaterials(atlas), [atlas]);
  const initChunks = useWorldStore((state) => state.initChunks);
  const processChunkQueue = useWorldStore((state) => state.processChunkQueue);
  const processFluidSimulation = useWorldStore((state) => state.processFluidSimulation);
  const ensureChunksAround = useWorldStore((state) => state.ensureChunksAround);
  const graphicsPreset = useSettingsStore((state) => state.graphicsPreset);
  const renderDistance = useSettingsStore((state) => state.renderDistance);
  const shadowQuality = useSettingsStore((state) => state.shadowQuality);
  const { camera, gl } = useThree();
  const performanceProfile = getPerformanceProfile();
  const visibleDistance = Math.min(RENDER_DISTANCE, performanceProfile.visibleChunkRadius);
  const initialRenderDistance = Math.min(RENDER_DISTANCE, performanceProfile.initialRenderDistance);
  const castBlockShadows = performanceProfile.shadowsEnabled && performanceProfile.tier !== 'low';
  const [visibleChunks, setVisibleChunks] = useState<VisibleChunk[]>([]);
  const lastUpdateTime = useRef(0);
  const lastTelemetryTime = useRef(0);
  const previousVisibleKey = useRef('');
  const initialRenderDistanceRef = useRef(initialRenderDistance);

  useEffect(() => {
    initChunks(initialRenderDistanceRef.current);
  }, [initChunks]);

  useEffect(() => () => {
    atlas.texture.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [atlas, materials]);

  useFrame(() => {
    processChunkQueue();
    processFluidSimulation();

    const now = performance.now();
    if (now - lastTelemetryTime.current >= 1000) {
      lastTelemetryTime.current = now;
      gl.domElement.setAttribute('data-world-renderer', 'surface-mesh-v2');
      gl.domElement.setAttribute('data-visible-chunks', String(visibleChunks.length));
      gl.domElement.setAttribute('data-render-calls', String(gl.info.render.calls));
      gl.domElement.setAttribute('data-render-triangles', String(gl.info.render.triangles));
    }

    if (lastUpdateTime.current !== 0 && now - lastUpdateTime.current < 250) return;
    lastUpdateTime.current = now;

    const cameraChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
    const cameraChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
    ensureChunksAround(cameraChunkX, cameraChunkZ, visibleDistance);

    const state = useWorldStore.getState();
    const visible: VisibleChunk[] = [];
    const radiusSquared = (visibleDistance + 0.35) ** 2;
    for (let dx = -visibleDistance; dx <= visibleDistance; dx++) {
      for (let dz = -visibleDistance; dz <= visibleDistance; dz++) {
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared > radiusSquared) continue;
        const cx = cameraChunkX + dx;
        const cz = cameraChunkZ + dz;
        if (!state.chunks.has(`${cx},${cz}`)) continue;
        visible.push({ cx, cz, distance: Math.sqrt(distanceSquared) });
      }
    }
    visible.sort((a, b) => a.distance - b.distance || a.cx - b.cx || a.cz - b.cz);
    const visibleKey = visible.map(({ cx, cz }) => `${cx},${cz}`).join(';');
    if (visibleKey === previousVisibleKey.current) return;
    previousVisibleKey.current = visibleKey;
    setVisibleChunks(visible);
  });

  // 設定変更を描画計算へ確実に反映するためのプリミティブ依存。
  void graphicsPreset;
  void renderDistance;
  void shadowQuality;

  return (
    <group name="halcraft-world-surface-mesh-v2">
      {visibleChunks.map((chunk) => (
        <ChunkRenderer
          key={`${chunk.cx},${chunk.cz}`}
          {...chunk}
          materials={materials}
          atlas={atlas}
          castBlockShadows={castBlockShadows}
        />
      ))}
    </group>
  );
}
