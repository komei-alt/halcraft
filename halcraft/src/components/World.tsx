// 地形チャンクレンダリングコンポーネント
// ブロックデータを InstancedMesh で効率的に描画する

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, type BlockId, type BlockInfo } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { isBlockExposed } from '../utils/terrain';

/** テクスチャキャッシュ（コンポーネント外で管理） */
const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

function getBlockTexture(textureName: string): THREE.Texture {
  if (textureCache.has(textureName)) return textureCache.get(textureName)!;

  const texture = textureLoader.load(`/textures/blocks/${textureName}`);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  textureCache.set(textureName, texture);
  return texture;
}

/** マテリアルキャッシュ（ブロック定義のテクスチャ名をキーにキャッシュ） */
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const faceMaterialCache = new Map<string, THREE.MeshStandardMaterial[]>();

/** 共有boxGeometry（全InstancedMeshで再利用） */
const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);

function getMaterialProps(blockDef: BlockInfo): Record<string, unknown> {
  const props: Record<string, unknown> = {
    transparent: blockDef.transparent,
    opacity: blockDef.transparent ? 0.6 : 1,
    roughness: 0.85,
  };
  if (blockDef.emissiveColor) {
    props.emissive = blockDef.emissiveColor;
    props.emissiveIntensity = blockDef.emissiveIntensity ?? 0.5;
  } else if (blockDef.emissive) {
    props.emissive = new THREE.Color(0x333333);
    props.emissiveIntensity = blockDef.emissiveIntensity ?? 0.5;
  }
  return props;
}

function getCachedMaterial(blockDef: BlockInfo): THREE.MeshStandardMaterial {
  const key = blockDef.texture;
  if (materialCache.has(key)) return materialCache.get(key)!;
  const mat = new THREE.MeshStandardMaterial({
    map: getBlockTexture(blockDef.texture),
    ...getMaterialProps(blockDef),
  });
  materialCache.set(key, mat);
  return mat;
}

function getCachedFaceMaterials(blockDef: BlockInfo): THREE.MeshStandardMaterial[] | null {
  if (!blockDef.faceTextures) return null;
  const key = `${blockDef.faceTextures.top}_${blockDef.faceTextures.side}_${blockDef.faceTextures.bottom}`;
  if (faceMaterialCache.has(key)) return faceMaterialCache.get(key)!;

  const { top, side, bottom } = blockDef.faceTextures;
  const topTex = getBlockTexture(top);
  const sideTex = getBlockTexture(side);
  const bottomTex = getBlockTexture(bottom);
  const props = getMaterialProps(blockDef);

  const mats = [
    new THREE.MeshStandardMaterial({ map: sideTex, ...props }),
    new THREE.MeshStandardMaterial({ map: sideTex, ...props }),
    new THREE.MeshStandardMaterial({ map: topTex, ...props }),
    new THREE.MeshStandardMaterial({ map: bottomTex, ...props }),
    new THREE.MeshStandardMaterial({ map: sideTex, ...props }),
    new THREE.MeshStandardMaterial({ map: sideTex, ...props }),
  ];
  faceMaterialCache.set(key, mats);
  return mats;
}

interface ChunkRendererProps {
  cx: number;
  cz: number;
}

/** 1チャンク分のブロックを描画するコンポーネント */
function ChunkRenderer({ cx, cz }: ChunkRendererProps) {
  const getChunk = useWorldStore((s) => s.getChunk);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);
  const version = chunkVersions.get(`${cx},${cz}`) ?? 0;

  const chunkData = getChunk(cx, cz);

  // ブロックタイプごとの描画データを計算（Float32Arrayで高速化）
  const blockGroups = useMemo(() => {
    if (!chunkData) return new Map<BlockId, Float32Array>();

    // まずカウントしてからTypedArrayを確保
    const counts = new Map<BlockId, number>();
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const blockId = chunkData[lx][ly][lz];
          if (blockId === BLOCK_IDS.AIR) continue;
          const blockDef = BLOCK_DEFS[blockId];
          if (blockDef?.nonStandard) continue;
          if (!isBlockExposed(chunkData, lx, ly, lz)) continue;
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
          if (blockDef?.nonStandard) continue;
          if (!isBlockExposed(chunkData, lx, ly, lz)) continue;

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
  }, [chunkData, cx, cz, version]);

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
}: {
  blockDef: BlockInfo;
  positionData: Float32Array;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const faceMaterials = getCachedFaceMaterials(blockDef);
  const material = faceMaterials ?? getCachedMaterial(blockDef);
  const count = positionData.length / 3;

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const off = i * 3;
      dummy.position.set(positionData[off] + 0.5, positionData[off + 1] + 0.5, positionData[off + 2] + 0.5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positionData, count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedBoxGeometry, undefined, count]}
      material={material}
      castShadow
      receiveShadow
    />
  );
}

/** ワールド全体の描画 */
export function World() {
  const initChunks = useWorldStore((s) => s.initChunks);
  const chunks = useWorldStore((s) => s.chunks);

  // 初回マウント時にチャンクを生成
  useEffect(() => {
    initChunks(4);
  }, [initChunks]);

  // 生成済みチャンクのキーからcx,czを取得
  const chunkCoords = useMemo(() => {
    const coords: [number, number][] = [];
    chunks.forEach((_, key) => {
      const [cx, cz] = key.split(',').map(Number);
      coords.push([cx, cz]);
    });
    return coords;
  }, [chunks]);

  return (
    <group>
      {chunkCoords.map(([cx, cz]) => (
        <ChunkRenderer key={`${cx},${cz}`} cx={cx} cz={cz} />
      ))}
    </group>
  );
}
