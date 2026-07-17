// レール3D描画コンポーネント v2
// チャンク内のレールブロックをカスタム3Dジオメトリで描画する
// 直線・カーブ（90°弧）・坂道・ブースター・ループ・チェーンリフトに対応

import { useEffect, useRef, useMemo } from 'react';
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

/** 2点を結ぶ向きへ長辺を合わせた直方体を追加する */
function addSegmentBox(
  positions: number[],
  colors: number[],
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  y: number,
  width: number,
  height: number,
  color: THREE.Color,
): void {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const length = Math.hypot(dx, dz);
  if (length <= 0.0001) return;

  // addBox の長辺はローカルZ軸なので、弧の接線へ向ける。
  const transform = new THREE.Matrix4().makeRotationY(Math.atan2(dx, dz));
  transform.setPosition((startX + endX) / 2, y, (startZ + endZ) / 2);
  addTransformedBox(positions, colors, transform, 0, 0, 0, width, height, length, color);
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
 * カーブは北端から西端へ曲がる形状（curve-nw基準）。
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

  const SEGMENTS = 8; // 接線の段差を目立たせず、頂点数も抑える分割数
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

    // 内側レール
    const ix0 = arcCX + Math.cos(a0) * INNER_R;
    const iz0 = arcCZ + Math.sin(a0) * INNER_R;
    const ix1 = arcCX + Math.cos(a1) * INNER_R;
    const iz1 = arcCZ + Math.sin(a1) * INNER_R;
    addSegmentBox(positions, colors, ix0, iz0, ix1, iz1, 0.05, RAIL_W * 2, RAIL_H * 2, railColor);

    // 外側レール
    const ox0 = arcCX + Math.cos(a0) * OUTER_R;
    const oz0 = arcCZ + Math.sin(a0) * OUTER_R;
    const ox1 = arcCX + Math.cos(a1) * OUTER_R;
    const oz1 = arcCZ + Math.sin(a1) * OUTER_R;
    addSegmentBox(positions, colors, ox0, oz0, ox1, oz1, 0.05, RAIL_W * 2, RAIL_H * 2, railColor);

    // 枕木（2セグメントに1本）
    if (i % 2 === 0) {
      const tieInnerX = arcCX + Math.cos(aMid) * (INNER_R - 0.08);
      const tieInnerZ = arcCZ + Math.sin(aMid) * (INNER_R - 0.08);
      const tieOuterX = arcCX + Math.cos(aMid) * (OUTER_R + 0.08);
      const tieOuterZ = arcCZ + Math.sin(aMid) * (OUTER_R + 0.08);
      // 枕木は接線と直交する半径方向へ向ける。
      addSegmentBox(
        positions,
        colors,
        tieInnerX,
        tieInnerZ,
        tieOuterX,
        tieOuterZ,
        0,
        0.11,
        0.04,
        tieColor,
      );
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

function isSlopeOrientation(o: RailOrientation): boolean {
  return o === 'slope-n' || o === 'slope-s' || o === 'slope-e' || o === 'slope-w';
}

/** レール形状をワールドへ移す。坂はブロック対角線の実長と1ブロック高を使う。 */
function createRailTransform(rail: RailInstance): THREE.Matrix4 {
  if (isSlopeOrientation(rail.orientation)) {
    const direction = new THREE.Vector3();
    switch (rail.orientation) {
      case 'slope-n':
        direction.set(0, 1, -1);
        break;
      case 'slope-s':
        direction.set(0, 1, 1);
        break;
      case 'slope-e':
        direction.set(1, 1, 0);
        break;
      case 'slope-w':
        direction.set(-1, 1, 0);
        break;
    }
    direction.normalize();
    // 単純なsetFromUnitVectorsだと坂で軌間方向まで傾くため、水平な右軸を明示する。
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const trackUp = new THREE.Vector3().crossVectors(direction, right).normalize();
    const transform = new THREE.Matrix4().makeBasis(right, trackUp, direction);
    // 水平1 + 高さ1なので実長は√2。端点が隣接レール中心へ正確につながる。
    transform.scale(new THREE.Vector3(1, 1, Math.SQRT2));
    transform.setPosition(rail.x + 0.5, rail.y + 0.5, rail.z + 0.5);
    return transform;
  }

  let rotationY = 0;
  if (isCurveOrientation(rail.orientation)) {
    // 基準形状はcurve-nw。接続方角ごとに90度回転する。
    switch (rail.orientation) {
      case 'curve-ne':
        rotationY = -Math.PI / 2;
        break;
      case 'curve-se':
        rotationY = Math.PI;
        break;
      case 'curve-sw':
        rotationY = Math.PI / 2;
        break;
      case 'curve-nw':
        rotationY = 0;
        break;
    }
  } else if (rail.orientation === 'ew') {
    rotationY = Math.PI / 2;
  }

  const transform = new THREE.Matrix4().makeRotationY(rotationY);
  transform.setPosition(rail.x + 0.5, rail.y, rail.z + 0.5);
  return transform;
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
  const mergedGeo = useMemo(() => {
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

    const allPositions: number[] = [];
    const allColors: number[] = [];

    for (const rail of rails) {
      const color = new THREE.Color(RAIL_COLORS[rail.blockId] ?? 0x888888);
      const isCurve = isCurveOrientation(rail.orientation);
      const baseGeo = isCurve ? curveGeo : straightGeo;
      const vertCount = baseGeo.positions.length / 3;

      const mat = createRailTransform(rail);

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

      // 物理コースらしさを出すため、浮いたレールには簡易支柱を自動描画する。
      const supportBaseY = findSupportBaseY(getBlock, rail.x, rail.y, rail.z);
      const supportHeight = rail.y - supportBaseY;
      if (supportHeight > 1.1) {
        const supportColor = new THREE.Color(SUPPORT_COLOR);
        const centerY = supportBaseY + supportHeight / 2;
        addBox(allPositions, allColors, rail.x + 0.28, centerY, rail.z + 0.28, 0.07, supportHeight, 0.07, supportColor);
        addBox(allPositions, allColors, rail.x + 0.72, centerY, rail.z + 0.72, 0.07, supportHeight, 0.07, supportColor);
        addBox(allPositions, allColors, rail.x + 0.5, supportBaseY + supportHeight * 0.52, rail.z + 0.5, 0.62, 0.05, 0.05, supportColor);
      }

      if (rail.blockId === BLOCK_IDS.RAIL_BOOSTER) {
        const arrowColor = new THREE.Color(BOOSTER_ARROW_COLOR);
        addTransformedBox(allPositions, allColors, mat, 0, 0.13, -0.24, 0.5, 0.035, 0.08, arrowColor);
        addTransformedBox(allPositions, allColors, mat, 0, 0.13, 0.0, 0.5, 0.035, 0.08, arrowColor);
        addTransformedBox(allPositions, allColors, mat, 0, 0.13, 0.24, 0.5, 0.035, 0.08, arrowColor);
      } else if (rail.blockId === BLOCK_IDS.RAIL_CHAIN) {
        const chainColor = new THREE.Color(CHAIN_LINK_COLOR);
        for (let link = -2; link <= 2; link++) {
          addTransformedBox(allPositions, allColors, mat, 0, 0.12, link * 0.18, 0.18, 0.04, 0.08, chainColor);
          addTransformedBox(allPositions, allColors, mat, 0, 0.15, link * 0.18 + 0.09, 0.08, 0.04, 0.16, chainColor);
        }
      } else if (rail.blockId === BLOCK_IDS.RAIL_LOOP) {
        const loopColor = new THREE.Color(LOOP_MARK_COLOR);
        addTransformedBox(allPositions, allColors, mat, -0.42, 0.18, 0, 0.05, 0.26, 0.9, loopColor);
        addTransformedBox(allPositions, allColors, mat, 0.42, 0.18, 0, 0.05, 0.26, 0.9, loopColor);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(allColors, 3));
    geo.computeVertexNormals();
    return geo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockIndexVersion, straightGeo, curveGeo, getBlock, getIndexedBlockPositions]);

  useEffect(() => () => mergedGeo?.dispose(), [mergedGeo]);

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
    <mesh ref={meshRef} geometry={mergedGeo} castShadow receiveShadow>
      <meshStandardMaterial
        ref={matRef}
        vertexColors
        roughness={0.6}
        metalness={0.4}
        emissive={0x2a1b08}
      />
    </mesh>
  );
}
