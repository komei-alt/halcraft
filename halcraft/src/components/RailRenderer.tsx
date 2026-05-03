// レール3D描画コンポーネント
// チャンク内のレールブロックをカスタム3Dジオメトリで描画する
// 直線・カーブ・坂道・ブースター・ループに対応

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../types/blocks';
import { isRailBlock, detectRailOrientation, type RailOrientation } from '../utils/coasterPhysics';

/** レールの色定義 */
const RAIL_COLORS: Record<number, number> = {
  [BLOCK_IDS.RAIL]: 0x888888,
  [BLOCK_IDS.RAIL_SLOPE]: 0x888888,
  [BLOCK_IDS.RAIL_BOOSTER]: 0xff4400,
  [BLOCK_IDS.RAIL_LOOP]: 0x8844ff,
  [BLOCK_IDS.RAIL_CHAIN]: 0xcc8800,
};

const TIE_COLOR = 0x6b4226; // 枕木の色（木）

/** 直方体の頂点を追加 */
function addBox(
  positions: number[], colors: number[],
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: THREE.Color,
): void {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    [cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz,
      cx - hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz + hz],
    [cx + hx, cy - hy, cz - hz, cx - hx, cy - hy, cz - hz, cx - hx, cy + hy, cz - hz,
      cx + hx, cy - hy, cz - hz, cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz, cx - hx, cy + hy, cz + hz, cx + hx, cy + hy, cz + hz,
      cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz + hz, cx + hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz, cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz,
      cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz - hz, cx + hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz, cx + hx, cy - hy, cz - hz, cx + hx, cy + hy, cz - hz,
      cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz - hz, cx + hx, cy + hy, cz + hz],
    [cx - hx, cy - hy, cz - hz, cx - hx, cy - hy, cz + hz, cx - hx, cy + hy, cz + hz,
      cx - hx, cy - hy, cz - hz, cx - hx, cy + hy, cz + hz, cx - hx, cy + hy, cz - hz],
  ];
  for (const face of faces) {
    for (let i = 0; i < face.length; i += 3) {
      positions.push(face[i], face[i + 1], face[i + 2]);
      colors.push(color.r, color.g, color.b);
    }
  }
}

/** レール1本のジオメトリ（2本の平行レール + 枕木3本） */
function createRailGeometry(): { positions: number[]; colors: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];

  const railColor = new THREE.Color(0x888888);
  const tieColor = new THREE.Color(TIE_COLOR);

  // 左レール
  addBox(positions, colors, -0.35, 0.05, 0, 0.08, 0.08, 1.0, railColor);
  // 右レール
  addBox(positions, colors, 0.35, 0.05, 0, 0.08, 0.08, 1.0, railColor);
  // 枕木3本
  addBox(positions, colors, 0, 0.0, -0.35, 0.9, 0.04, 0.12, tieColor);
  addBox(positions, colors, 0, 0.0, 0.0, 0.9, 0.04, 0.12, tieColor);
  addBox(positions, colors, 0, 0.0, 0.35, 0.9, 0.04, 0.12, tieColor);

  return { positions, colors };
}

/** レールのワールド座標とメタ情報 */
interface RailInstance {
  x: number;
  y: number;
  z: number;
  blockId: number;
  orientation: RailOrientation;
}

export function RailRenderer() {
  const meshRef = useRef<THREE.Mesh>(null);
  const getBlock = useWorldStore((s) => s.getBlock);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);

  // chunkVersionsの合計をバージョンキーにする
  const versionKey = useMemo(() => {
    let sum = 0;
    for (const v of chunkVersions.values()) sum += v;
    return sum;
  }, [chunkVersions]);

  // 基本レールの頂点データ
  const baseRail = useMemo(() => createRailGeometry(), []);

  // レールインスタンスの収集と統合ジオメトリの構築
  const mergedGeo = useMemo(() => {
    const rails: RailInstance[] = [];

    // ロード済みチャンクからレールブロックをスキャン
    const chunks = useWorldStore.getState().chunks;
    for (const [chunkKeyStr, chunkData] of chunks.entries()) {
      const parts = chunkKeyStr.split(',');
      const cx = parseInt(parts[0]) * CHUNK_SIZE;
      const cz = parseInt(parts[1]) * CHUNK_SIZE;

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const blockId = chunkData[lx][ly][lz];
            if (!isRailBlock(blockId)) continue;

            const wx = cx + lx;
            const wz = cz + lz;
            const orientation = detectRailOrientation(getBlock, wx, ly, wz);
            rails.push({ x: wx, y: ly, z: wz, blockId, orientation });
          }
        }
      }
    }

    if (rails.length === 0) return null;

    // 全レールの頂点を結合
    const allPositions: number[] = [];
    const allColors: number[] = [];
    const vertCount = baseRail.positions.length / 3;

    for (const rail of rails) {
      const color = new THREE.Color(RAIL_COLORS[rail.blockId] ?? 0x888888);

      // 回転行列の構築
      const mat = new THREE.Matrix4();
      mat.identity();

      // 方向に応じた回転
      const rotMat = new THREE.Matrix4();
      switch (rail.orientation) {
        case 'ew':
          rotMat.makeRotationY(Math.PI / 2);
          break;
        case 'curve-ne':
          rotMat.makeRotationY(-Math.PI / 4);
          break;
        case 'curve-nw':
          rotMat.makeRotationY(Math.PI / 4);
          break;
        case 'curve-se':
          rotMat.makeRotationY(-Math.PI * 3 / 4);
          break;
        case 'curve-sw':
          rotMat.makeRotationY(Math.PI * 3 / 4);
          break;
        case 'slope-n':
          rotMat.makeRotationX(-Math.PI / 4);
          break;
        case 'slope-s':
          rotMat.makeRotationX(Math.PI / 4);
          break;
        case 'slope-e': {
          const r1 = new THREE.Matrix4().makeRotationY(Math.PI / 2);
          const r2 = new THREE.Matrix4().makeRotationX(-Math.PI / 4);
          rotMat.multiplyMatrices(r1, r2);
          break;
        }
        case 'slope-w': {
          const r1 = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
          const r2 = new THREE.Matrix4().makeRotationX(-Math.PI / 4);
          rotMat.multiplyMatrices(r1, r2);
          break;
        }
        default:
          rotMat.identity();
          break;
      }

      mat.makeTranslation(rail.x + 0.5, rail.y, rail.z + 0.5);
      mat.multiply(rotMat);

      const tmpVec = new THREE.Vector3();
      for (let i = 0; i < vertCount; i++) {
        const si = i * 3;
        tmpVec.set(baseRail.positions[si], baseRail.positions[si + 1], baseRail.positions[si + 2]);
        tmpVec.applyMatrix4(mat);
        allPositions.push(tmpVec.x, tmpVec.y, tmpVec.z);

        // ブースター・ループ・チェーンリフトは専用色
        if (rail.blockId === BLOCK_IDS.RAIL_BOOSTER || rail.blockId === BLOCK_IDS.RAIL_LOOP || rail.blockId === BLOCK_IDS.RAIL_CHAIN) {
          allColors.push(color.r, color.g, color.b);
        } else {
          allColors.push(baseRail.colors[si], baseRail.colors[si + 1], baseRail.colors[si + 2]);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey, baseRail, getBlock]);

  // ブースターレールの発光アニメーション
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (matRef.current) {
      const t = (performance.now() / 1000) % 2;
      matRef.current.emissiveIntensity = 0.3 + Math.sin(t * Math.PI) * 0.4;
    }
  });

  if (!mergedGeo) return null;

  return (
    <mesh ref={meshRef} geometry={mergedGeo}>
      <meshStandardMaterial
        ref={matRef}
        vertexColors
        roughness={0.6}
        metalness={0.4}
      />
    </mesh>
  );
}
