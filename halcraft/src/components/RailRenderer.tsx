// レール3D描画コンポーネント v2
// チャンク内のレールブロックをカスタム3Dジオメトリで描画する
// 直線・カーブ（90°弧）・坂道・ブースター・ループ・チェーンリフトに対応

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

const TIE_COLOR = 0x6b4226;
const RAIL_COLOR_HEX = 0x888888;

// ═══════════════════════════════════════════════════════
// ジオメトリ構築ヘルパー
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// 直線レールジオメトリ（2本の平行レール + 枕木3本）
// ═══════════════════════════════════════════════════════

function createStraightRailGeometry(): { positions: number[]; colors: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const railColor = new THREE.Color(RAIL_COLOR_HEX);
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

// ═══════════════════════════════════════════════════════
// カーブレールジオメトリ（90°弧形）
// ═══════════════════════════════════════════════════════

/**
 * 90°のカーブレールジオメトリを生成する。
 * カーブは原点を中心に、+Z方向から+X方向へ曲がる形状（curve-se基準）。
 * 他の方向は回転で対応する。
 *
 * レール中心は原点にあり、弧の中心は(-0.5, 0, -0.5)。
 * 弧の半径は0.5（ブロックの半分）で、2本のレールが内側/外側に。
 */
function createCurveRailGeometry(): { positions: number[]; colors: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const railColor = new THREE.Color(RAIL_COLOR_HEX);
  const tieColor = new THREE.Color(TIE_COLOR);

  const SEGMENTS = 6; // 弧の分割数
  const INNER_R = 0.15; // 内側レールの半径
  const OUTER_R = 0.85; // 外側レールの半径
  const RAIL_W = 0.04; // レールの幅（断面半径）
  const RAIL_H = 0.04; // レールの高さ

  // 弧の中心（ブロック左下コーナー寄り）
  const arcCX = -0.5;
  const arcCZ = -0.5;

  // レールセグメントを弧に沿って配置
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * (Math.PI / 2);
    const a1 = ((i + 1) / SEGMENTS) * (Math.PI / 2);
    const aMid = (a0 + a1) / 2;

    // セグメント長
    const segLen = ((a1 - a0) * (INNER_R + OUTER_R) / 2);

    // 内側レール
    const ix = arcCX + Math.cos(aMid) * INNER_R;
    const iz = arcCZ + Math.sin(aMid) * INNER_R;
    addBox(positions, colors, ix, 0.05, iz, RAIL_W * 2, RAIL_H * 2, segLen, railColor);

    // 外側レール
    const ox = arcCX + Math.cos(aMid) * OUTER_R;
    const oz = arcCZ + Math.sin(aMid) * OUTER_R;
    addBox(positions, colors, ox, 0.05, oz, RAIL_W * 2, RAIL_H * 2, segLen, railColor);

    // 枕木（2セグメントに1本）
    if (i % 2 === 0) {
      const tmx = arcCX + Math.cos(aMid) * ((INNER_R + OUTER_R) / 2);
      const tmz = arcCZ + Math.sin(aMid) * ((INNER_R + OUTER_R) / 2);
      const tieLen = OUTER_R - INNER_R;
      addBox(positions, colors, tmx, 0.0, tmz, tieLen, 0.04, 0.10, tieColor);
    }
  }

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

/** カーブかどうか */
function isCurveOrientation(o: RailOrientation): boolean {
  return o === 'curve-ne' || o === 'curve-nw' || o === 'curve-se' || o === 'curve-sw';
}

export function RailRenderer() {
  const meshRef = useRef<THREE.Mesh>(null);
  const getBlock = useWorldStore((s) => s.getBlock);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);

  const versionKey = useMemo(() => {
    let sum = 0;
    for (const v of chunkVersions.values()) sum += v;
    return sum;
  }, [chunkVersions]);

  // 直線レールとカーブレールの基本ジオメトリ
  const straightGeo = useMemo(() => createStraightRailGeometry(), []);
  const curveGeo = useMemo(() => createCurveRailGeometry(), []);

  // レールインスタンスの収集と統合ジオメトリの構築
  const mergedGeo = useMemo(() => {
    const rails: RailInstance[] = [];

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

    const allPositions: number[] = [];
    const allColors: number[] = [];

    for (const rail of rails) {
      const color = new THREE.Color(RAIL_COLORS[rail.blockId] ?? 0x888888);
      const isCurve = isCurveOrientation(rail.orientation);
      const baseGeo = isCurve ? curveGeo : straightGeo;
      const vertCount = baseGeo.positions.length / 3;

      // 回転行列の構築
      const rotMat = new THREE.Matrix4();

      if (isCurve) {
        // カーブ: 弧の基準はcurve-se（+Z→+X）。他方向は回転で対応
        switch (rail.orientation) {
          case 'curve-se':
            rotMat.identity();
            break;
          case 'curve-sw':
            rotMat.makeRotationY(Math.PI / 2);
            break;
          case 'curve-nw':
            rotMat.makeRotationY(Math.PI);
            break;
          case 'curve-ne':
            rotMat.makeRotationY(-Math.PI / 2);
            break;
        }
      } else {
        // 直線・坂道
        switch (rail.orientation) {
          case 'ew':
            rotMat.makeRotationY(Math.PI / 2);
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
      }

      const mat = new THREE.Matrix4();
      mat.makeTranslation(rail.x + 0.5, rail.y, rail.z + 0.5);
      mat.multiply(rotMat);

      const tmpVec = new THREE.Vector3();
      for (let i = 0; i < vertCount; i++) {
        const si = i * 3;
        tmpVec.set(baseGeo.positions[si], baseGeo.positions[si + 1], baseGeo.positions[si + 2]);
        tmpVec.applyMatrix4(mat);
        allPositions.push(tmpVec.x, tmpVec.y, tmpVec.z);

        // 特殊レール（ブースター・ループ・チェーン）は専用色
        if (
          rail.blockId === BLOCK_IDS.RAIL_BOOSTER ||
          rail.blockId === BLOCK_IDS.RAIL_LOOP ||
          rail.blockId === BLOCK_IDS.RAIL_CHAIN
        ) {
          allColors.push(color.r, color.g, color.b);
        } else {
          allColors.push(baseGeo.colors[si], baseGeo.colors[si + 1], baseGeo.colors[si + 2]);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey, straightGeo, curveGeo, getBlock]);

  // 特殊レールの発光アニメーション
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
