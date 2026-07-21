// レール3D描画コンポーネント v2
// チャンク内のレールブロックをカスタム3Dジオメトリで描画する
// 直線・カーブ（90°弧）・坂道・ブースター・ループ・チェーンリフトに対応

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_IDS } from '../types/blocks';
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
const SUPPORT_COLOR = 0x4b5563;
const BOOSTER_ARROW_COLOR = 0xffd34d;
const CHAIN_LINK_COLOR = 0x2f3138;
const LOOP_MARK_COLOR = 0xc7a5ff;

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

function addTransformedBox(
  positions: number[],
  colors: number[],
  transform: THREE.Matrix4,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: THREE.Color,
): void {
  const localPositions: number[] = [];
  const localColors: number[] = [];
  addBox(localPositions, localColors, cx, cy, cz, sx, sy, sz, color);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < localPositions.length; i += 3) {
    tmp.set(localPositions[i], localPositions[i + 1], localPositions[i + 2]);
    tmp.applyMatrix4(transform);
    positions.push(tmp.x, tmp.y, tmp.z);
    colors.push(color.r, color.g, color.b);
  }
}

function findSupportBaseY(
  getBlock: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): number {
  for (let by = y - 1; by >= 0; by--) {
    if (getBlock(x, by, z) !== BLOCK_IDS.AIR) return by + 1;
  }
  return 0;
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

  const SEGMENTS = 8; // 弧の分割数
  const INNER_R = 0.15; // 内側レールの半径
  const OUTER_R = 0.85; // 外側レールの半径
  const RAIL_W = 0.04; // レールの幅（断面半径）
  const RAIL_H = 0.04; // レールの高さ

  // 弧の中心（ブロック左下コーナー寄り）
  const arcCX = -0.5;
  const arcCZ = -0.5;
  const transform = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const xAxis = new THREE.Vector3(1, 0, 0);

  // レールセグメントを接線方向に回転させて弧へ沿わせる
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * (Math.PI / 2);
    const a1 = ((i + 1) / SEGMENTS) * (Math.PI / 2);
    const aMid = (a0 + a1) / 2;
    const cosA = Math.cos(aMid);
    const sinA = Math.sin(aMid);
    tangent.set(-sinA, 0, cosA).normalize();
    radial.set(cosA, 0, sinA).normalize();

    // 内側レール
    const innerSegLen = (a1 - a0) * INNER_R;
    position.set(arcCX + cosA * INNER_R, 0.05, arcCZ + sinA * INNER_R);
    quaternion.setFromUnitVectors(zAxis, tangent);
    transform.compose(position, quaternion, scale);
    addTransformedBox(positions, colors, transform, 0, 0, 0, RAIL_W * 2, RAIL_H * 2, innerSegLen, railColor);

    // 外側レール
    const outerSegLen = (a1 - a0) * OUTER_R;
    position.set(arcCX + cosA * OUTER_R, 0.05, arcCZ + sinA * OUTER_R);
    transform.compose(position, quaternion, scale);
    addTransformedBox(positions, colors, transform, 0, 0, 0, RAIL_W * 2, RAIL_H * 2, outerSegLen, railColor);

    // 枕木（2セグメントに1本）— 半径方向へ伸ばす
    if (i % 2 === 0) {
      const tieLen = OUTER_R - INNER_R;
      position.set(
        arcCX + cosA * ((INNER_R + OUTER_R) / 2),
        0.0,
        arcCZ + sinA * ((INNER_R + OUTER_R) / 2),
      );
      quaternion.setFromUnitVectors(xAxis, radial);
      transform.compose(position, quaternion, scale);
      addTransformedBox(positions, colors, transform, 0, 0, 0, tieLen, 0.04, 0.10, tieColor);
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
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);

  // 直線レールとカーブレールの基本ジオメトリ
  const straightGeo = useMemo(() => createStraightRailGeometry(), []);
  const curveGeo = useMemo(() => createCurveRailGeometry(), []);

  // レールインスタンスの収集と統合ジオメトリの構築
  // 通常レールと特殊レールを分け、発光アニメが全体に波及しないようにする
  const mergedGeos = useMemo(() => {
    const rails: RailInstance[] = [];

    const railBlockIds = [
      BLOCK_IDS.RAIL,
      BLOCK_IDS.RAIL_SLOPE,
      BLOCK_IDS.RAIL_BOOSTER,
      BLOCK_IDS.RAIL_LOOP,
      BLOCK_IDS.RAIL_CHAIN,
    ];

    for (const railBlockId of railBlockIds) {
      const positions = getIndexedBlockPositions(railBlockId);
      for (const pos of positions) {
        if (!isRailBlock(pos.blockId)) continue;
        const orientation = detectRailOrientation(getBlock, pos.x, pos.y, pos.z);
        rails.push({ x: pos.x, y: pos.y, z: pos.z, blockId: pos.blockId, orientation });
      }
    }

    if (rails.length === 0) return null;

    const basePositions: number[] = [];
    const baseColors: number[] = [];
    const specialPositions: number[] = [];
    const specialColors: number[] = [];

    for (const rail of rails) {
      const color = new THREE.Color(RAIL_COLORS[rail.blockId] ?? 0x888888);
      const isSpecial =
        rail.blockId === BLOCK_IDS.RAIL_BOOSTER ||
        rail.blockId === BLOCK_IDS.RAIL_LOOP ||
        rail.blockId === BLOCK_IDS.RAIL_CHAIN;
      const targetPositions = isSpecial ? specialPositions : basePositions;
      const targetColors = isSpecial ? specialColors : baseColors;
      const isCurve = isCurveOrientation(rail.orientation);
      const templateGeo = isCurve ? curveGeo : straightGeo;
      const vertCount = templateGeo.positions.length / 3;

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
          // 直線レールは ±Z。+rotationX で +Z 端が下がるので、北(+Zの反対)が高い slope-n は +rotationX
          case 'slope-n':
            rotMat.makeRotationX(Math.PI / 4);
            break;
          case 'slope-s':
            rotMat.makeRotationX(-Math.PI / 4);
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
      // 坂道は原点回転で一端が沈むため、半分の高さ分だけ持ち上げて地面に載せる
      const isSlope = rail.orientation.startsWith('slope-');
      const slopeLift = isSlope ? 0.5 * Math.SQRT1_2 : 0;
      mat.makeTranslation(rail.x + 0.5, rail.y + slopeLift, rail.z + 0.5);
      mat.multiply(rotMat);

      const tmpVec = new THREE.Vector3();
      for (let i = 0; i < vertCount; i++) {
        const si = i * 3;
        tmpVec.set(templateGeo.positions[si], templateGeo.positions[si + 1], templateGeo.positions[si + 2]);
        tmpVec.applyMatrix4(mat);
        targetPositions.push(tmpVec.x, tmpVec.y, tmpVec.z);

        // 特殊レール（ブースター・ループ・チェーン）は専用色
        if (isSpecial) {
          targetColors.push(color.r, color.g, color.b);
        } else {
          targetColors.push(templateGeo.colors[si], templateGeo.colors[si + 1], templateGeo.colors[si + 2]);
        }
      }

      // 物理コースらしさを出すため、浮いたレールには簡易支柱を自動描画する。
      const supportBaseY = findSupportBaseY(getBlock, rail.x, rail.y, rail.z);
      const supportHeight = rail.y - supportBaseY;
      if (supportHeight > 1.1) {
        const supportColor = new THREE.Color(SUPPORT_COLOR);
        const centerY = supportBaseY + supportHeight / 2;
        addBox(targetPositions, targetColors, rail.x + 0.28, centerY, rail.z + 0.28, 0.07, supportHeight, 0.07, supportColor);
        addBox(targetPositions, targetColors, rail.x + 0.72, centerY, rail.z + 0.72, 0.07, supportHeight, 0.07, supportColor);
        addBox(targetPositions, targetColors, rail.x + 0.5, supportBaseY + supportHeight * 0.52, rail.z + 0.5, 0.62, 0.05, 0.05, supportColor);
      }

      if (rail.blockId === BLOCK_IDS.RAIL_BOOSTER) {
        const arrowColor = new THREE.Color(BOOSTER_ARROW_COLOR);
        addTransformedBox(targetPositions, targetColors, mat, 0, 0.13, -0.24, 0.5, 0.035, 0.08, arrowColor);
        addTransformedBox(targetPositions, targetColors, mat, 0, 0.13, 0.0, 0.5, 0.035, 0.08, arrowColor);
        addTransformedBox(targetPositions, targetColors, mat, 0, 0.13, 0.24, 0.5, 0.035, 0.08, arrowColor);
      } else if (rail.blockId === BLOCK_IDS.RAIL_CHAIN) {
        const chainColor = new THREE.Color(CHAIN_LINK_COLOR);
        for (let link = -2; link <= 2; link++) {
          addTransformedBox(targetPositions, targetColors, mat, 0, 0.12, link * 0.18, 0.18, 0.04, 0.08, chainColor);
          addTransformedBox(targetPositions, targetColors, mat, 0, 0.15, link * 0.18 + 0.09, 0.08, 0.04, 0.16, chainColor);
        }
      } else if (rail.blockId === BLOCK_IDS.RAIL_LOOP) {
        const loopColor = new THREE.Color(LOOP_MARK_COLOR);
        addTransformedBox(targetPositions, targetColors, mat, -0.42, 0.18, 0, 0.05, 0.26, 0.9, loopColor);
        addTransformedBox(targetPositions, targetColors, mat, 0.42, 0.18, 0, 0.05, 0.26, 0.9, loopColor);
      }
    }

    const makeGeo = (positions: number[], colors: number[]) => {
      if (positions.length === 0) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    };

    return {
      base: makeGeo(basePositions, baseColors),
      special: makeGeo(specialPositions, specialColors),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIndexVersion, straightGeo, curveGeo, getBlock, getIndexedBlockPositions]);

  // 特殊レールだけ発光アニメーション
  const specialMatRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (specialMatRef.current) {
      const t = (performance.now() / 1000) % 2;
      specialMatRef.current.emissiveIntensity = 0.35 + Math.sin(t * Math.PI) * 0.45;
    }
  });

  if (!mergedGeos) return null;

  return (
    <group>
      {mergedGeos.base && (
        <mesh ref={meshRef} geometry={mergedGeos.base}>
          <meshStandardMaterial
            vertexColors
            roughness={0.6}
            metalness={0.4}
          />
        </mesh>
      )}
      {mergedGeos.special && (
        <mesh geometry={mergedGeos.special}>
          <meshStandardMaterial
            ref={specialMatRef}
            vertexColors
            roughness={0.45}
            metalness={0.55}
            emissive={0x2a1b08}
            emissiveIntensity={0.35}
          />
        </mesh>
      )}
    </group>
  );
}
