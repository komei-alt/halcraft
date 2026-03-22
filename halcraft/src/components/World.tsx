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

  // ブロックタイプごとの描画データを計算
  const blockGroups = useMemo(() => {
    if (!chunkData) return new Map<BlockId, THREE.Vector3[]>();

    const groups = new Map<BlockId, THREE.Vector3[]>();

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const blockId = chunkData[lx][ly][lz];
          if (blockId === BLOCK_IDS.AIR) continue;

          // 非標準形状（松明等）はInstancedMeshではなく個別描画
          const blockDef = BLOCK_DEFS[blockId];
          if (blockDef?.nonStandard) continue;
          if (!isBlockExposed(chunkData, lx, ly, lz)) continue;

          const worldX = cx * CHUNK_SIZE + lx;
          const worldZ = cz * CHUNK_SIZE + lz;

          if (!groups.has(blockId)) {
            groups.set(blockId, []);
          }
          groups.get(blockId)!.push(new THREE.Vector3(worldX, ly, worldZ));
        }
      }
    }

    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunkData, cx, cz, version]);

  if (!chunkData) return null;

  return (
    <group>
      {Array.from(blockGroups.entries()).map(([blockId, positions]) => {
        const def = BLOCK_DEFS[blockId];
        if (!def || positions.length === 0) return null;
        return (
          <BlockTypeInstances
            key={`${cx}-${cz}-${blockId}-${version}`}
            blockDef={def}
            positions={positions}
          />
        );
      })}
    </group>
  );
}

/** マテリアル共通プロパティを生成 */
function createMaterialProps(blockDef: BlockInfo) {
  return {
    transparent: blockDef.transparent,
    opacity: blockDef.transparent ? 0.6 : 1,
    emissive: blockDef.emissiveColor ?? (blockDef.emissive ? new THREE.Color(0x333333) : undefined),
    emissiveIntensity: blockDef.emissiveIntensity ?? (blockDef.emissive ? 0.5 : 0),
    roughness: 0.85,
  };
}

/**
 * 面別テクスチャ用のマテリアル配列を生成
 * Three.js の boxGeometry の面順序: +X, -X, +Y, -Y, +Z, -Z
 * つまり: 右, 左, 上, 下, 前, 後
 */
function useFaceMaterials(blockDef: BlockInfo): THREE.MeshStandardMaterial[] | null {
  return useMemo(() => {
    if (!blockDef.faceTextures) return null;

    const { top, side, bottom } = blockDef.faceTextures;
    const topTex = getBlockTexture(top);
    const sideTex = getBlockTexture(side);
    const bottomTex = getBlockTexture(bottom);
    const props = createMaterialProps(blockDef);

    // boxGeometry の面順序: +X(右), -X(左), +Y(上), -Y(下), +Z(前), -Z(後)
    return [
      new THREE.MeshStandardMaterial({ map: sideTex, ...props }),   // 右
      new THREE.MeshStandardMaterial({ map: sideTex, ...props }),   // 左
      new THREE.MeshStandardMaterial({ map: topTex, ...props }),    // 上
      new THREE.MeshStandardMaterial({ map: bottomTex, ...props }), // 下
      new THREE.MeshStandardMaterial({ map: sideTex, ...props }),   // 前
      new THREE.MeshStandardMaterial({ map: sideTex, ...props }),   // 後
    ];
  }, [blockDef]);
}

/** 1ブロック種のインスタンスをまとめて描画 */
function BlockTypeInstances({
  blockDef,
  positions,
}: {
  blockDef: BlockInfo;
  positions: THREE.Vector3[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => getBlockTexture(blockDef.texture), [blockDef.texture]);
  const faceMaterials = useFaceMaterials(blockDef);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    positions.forEach((pos, i) => {
      dummy.position.set(pos.x + 0.5, pos.y + 0.5, pos.z + 0.5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions]);

  const materialProps = useMemo(() => createMaterialProps(blockDef), [blockDef]);

  // 面別テクスチャがある場合はマテリアル配列を使用
  if (faceMaterials) {
    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, positions.length]}
        material={faceMaterials}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    );
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={texture}
        {...materialProps}
      />
    </instancedMesh>
  );
}

/** ワールド全体の描画 */
export function World() {
  const initChunks = useWorldStore((s) => s.initChunks);
  const chunks = useWorldStore((s) => s.chunks);

  // 初回マウント時にチャンクを生成
  useEffect(() => {
    initChunks(2);
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
