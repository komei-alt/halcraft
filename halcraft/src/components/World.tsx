// 地形チャンクレンダリングコンポーネント
// ブロックデータを InstancedMesh で効率的に描画する
// カメラ距離ベースのチャンクカリングで描画負荷を大幅削減
// 段階的チャンク生成で初期ロードの体験を改善

import { useMemo, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, BLOCK_DEFS, CHUNK_SIZE, WORLD_HEIGHT, RENDER_DISTANCE, type BlockId, type BlockInfo } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';
import { isBlockExposed } from '../utils/terrain/blockExposure';

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
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positionData, count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[sharedBoxGeometry, undefined, count]}
      material={material}
      receiveShadow
    />
  );
}

/** カメラ視錐台カリング用の描画距離（チャンク単位） */
const VISIBLE_DISTANCE = 10;

/** ワールド全体の描画 */
export function World() {
  const initChunks = useWorldStore((s) => s.initChunks);
  const processChunkQueue = useWorldStore((s) => s.processChunkQueue);
  const ensureChunksAround = useWorldStore((s) => s.ensureChunksAround);
  const { camera } = useThree();

  // カメラ位置からの可視チャンク（毎フレーム更新は重いので500msごと）
  const [visibleChunks, setVisibleChunks] = useState<[number, number][]>([]);
  const lastUpdateTime = useRef(0);
  const initialized = useRef(false);

  // 初回マウント時にチャンクを生成
  useEffect(() => {
    initChunks(RENDER_DISTANCE);
    initialized.current = true;

    // 即座生成分の可視チャンクリストを同期的に構築
    const currentChunks = useWorldStore.getState().chunks;
    const initial: [number, number][] = [];
    currentChunks.forEach((_, key) => {
      const [cx, cz] = key.split(',').map(Number);
      initial.push([cx, cz]);
    });
    setVisibleChunks(initial);
  }, [initChunks]);

  // カメラ位置ベースで可視チャンクを更新 + 段階的チャンク生成
  const prevChunkKey = useRef('');

  useFrame(() => {
    // 段階的チャンク生成キューを毎フレーム処理
    processChunkQueue();

    const now = performance.now();
    // 初回（lastUpdateTime === 0）は即座に実行、以降は500ms間隔
    if (lastUpdateTime.current !== 0 && now - lastUpdateTime.current < 500) return;
    lastUpdateTime.current = now;

    const camX = Math.floor(camera.position.x / CHUNK_SIZE);
    const camZ = Math.floor(camera.position.z / CHUNK_SIZE);

    // カメラ周辺の未生成チャンクを動的に生成
    ensureChunksAround(camX, camZ, VISIBLE_DISTANCE);

    // 可視範囲のチャンクを収集
    const visible: [number, number][] = [];
    const keyParts: string[] = [];
    const currentChunks = useWorldStore.getState().chunks;
    currentChunks.forEach((_, key) => {
      const [cx, cz] = key.split(',').map(Number);
      const dx = Math.abs(cx - camX);
      const dz = Math.abs(cz - camZ);
      // チェビシェフ距離で判定（正方形の範囲）
      if (Math.max(dx, dz) <= VISIBLE_DISTANCE) {
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
        <ChunkRenderer key={`${cx},${cz}`} cx={cx} cz={cz} />
      ))}
    </group>
  );
}
