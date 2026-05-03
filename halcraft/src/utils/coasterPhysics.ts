// ジェットコースター物理エンジン
// レールブロックの接続検出、スプライン補間、重力ベースの速度管理
// ループ・カーブ・坂道すべて対応

import * as THREE from 'three';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import type { GetBlockFn } from './collision';

// ─── 定数 ─────────────────────────────────────
/** 重力加速度 (m/s²) — プレイヤー物理の |GRAVITY|=25 と一致 */
export const COASTER_GRAVITY = 25;
/** レール摩擦係数（速度²に比例する空気抵抗的減衰） */
export const COASTER_FRICTION = 0.015;
/** 最大速度 (m/s) */
export const COASTER_MAX_SPEED = 35;
/** ブースターレールの加速力 (m/s²) */
export const BOOSTER_ACCEL = 18;
/** ループ遠心力不足時に振り落とす最小速度 (m/s) */
export const LOOP_MIN_SPEED = 8;
/** ブレーキ減速力 (m/s²) */
export const BRAKE_DECEL = 12;
/** カート搭乗距離 */
export const CART_BOARD_DISTANCE = 3;
/** カメラ高さ（カート上方） */
export const CART_CAMERA_HEIGHT = 3.5;
/** カメラ後方距離 */
export const CART_CAMERA_BACK = 6;

// ─── ヘルパー ───────────────────────────────────
/** ブロックがレール系か判定 */
export function isRailBlock(blockId: BlockId): boolean {
  return (
    blockId === BLOCK_IDS.RAIL ||
    blockId === BLOCK_IDS.RAIL_SLOPE ||
    blockId === BLOCK_IDS.RAIL_BOOSTER ||
    blockId === BLOCK_IDS.RAIL_LOOP
  );
}

/** 4方向の水平隣接オフセット */
const H_NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];

/** 坂道を含む隣接オフセット（水平+上下1段） */
const SLOPE_NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
  [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
];

// ─── レール経路構築 ──────────────────────────────

/** レール位置をキーに変換 */
function posKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** 隣接レールブロックを検索 */
function findNeighborRails(
  getBlock: GetBlockFn,
  x: number, y: number, z: number,
): Array<[number, number, number]> {
  const results: Array<[number, number, number]> = [];
  for (const [dx, dy, dz] of SLOPE_NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (isRailBlock(getBlock(nx, ny, nz))) {
      results.push([nx, ny, nz]);
    }
  }
  return results;
}

/**
 * 開始位置から接続レールを辿り、順序付き経路を構築する。
 * BFS で全レールを発見し、端点からの直線走査で順序を確定する。
 */
export function buildTrackPath(
  getBlock: GetBlockFn,
  startX: number, startY: number, startZ: number,
): Array<{ x: number; y: number; z: number; blockId: BlockId }> {
  if (!isRailBlock(getBlock(startX, startY, startZ))) return [];

  // BFS で接続されたレール群を収集
  const visited = new Set<string>();
  const adjMap = new Map<string, Array<[number, number, number]>>();
  const queue: Array<[number, number, number]> = [[startX, startY, startZ]];
  visited.add(posKey(startX, startY, startZ));

  while (queue.length > 0) {
    const [cx, cy, cz] = queue.shift()!;
    const neighbors = findNeighborRails(getBlock, cx, cy, cz);
    const filtered: Array<[number, number, number]> = [];
    for (const [nx, ny, nz] of neighbors) {
      const key = posKey(nx, ny, nz);
      filtered.push([nx, ny, nz]);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([nx, ny, nz]);
      }
    }
    adjMap.set(posKey(cx, cy, cz), filtered);
  }

  // 端点（隣接レール数 <= 1）を探す。なければ周回コースとして開始位置を使う
  let endpointKey: string | null = null;
  for (const [key, neighbors] of adjMap) {
    if (neighbors.length <= 1) {
      endpointKey = key;
      break;
    }
  }

  // 端点からの走査で順序付き経路を構築
  const startKey = endpointKey ?? posKey(startX, startY, startZ);
  const path: Array<{ x: number; y: number; z: number; blockId: BlockId }> = [];
  const walked = new Set<string>();
  const [sx, sy, sz] = startKey.split(',').map(Number);
  let current: [number, number, number] = [sx, sy, sz];

  while (true) {
    const key = posKey(current[0], current[1], current[2]);
    if (walked.has(key)) break; // 周回完了
    walked.add(key);
    const blockId = getBlock(current[0], current[1], current[2]);
    path.push({ x: current[0], y: current[1], z: current[2], blockId });

    const neighbors = adjMap.get(key);
    if (!neighbors) break;
    const next = neighbors.find((n) => !walked.has(posKey(n[0], n[1], n[2])));
    if (!next) {
      // 周回チェック: 最初のブロックに戻れるなら閉じたコース
      if (path.length > 2) {
        const firstNeighbors = adjMap.get(posKey(path[0].x, path[0].y, path[0].z));
        if (firstNeighbors?.some((n) => posKey(n[0], n[1], n[2]) === key)) {
          // 閉ループ: 最初のブロックを末尾に追加してスプラインを閉じる
          path.push({ ...path[0] });
        }
      }
      break;
    }
    current = next;
  }

  return path;
}

// ─── スプライン生成 ──────────────────────────────

/** ループレール列を検出（垂直方向に連続するRAIL_LOOPブロック） */
export interface LoopSegment {
  /** スプライン上の開始パラメータ */
  startIdx: number;
  /** スプライン上の終了パラメータ */
  endIdx: number;
  /** ループ中心のワールド座標 */
  center: THREE.Vector3;
  /** ループ半径 */
  radius: number;
  /** ループの向き（進行方向のベクトル） */
  axis: THREE.Vector3;
}

/**
 * レール経路からスプラインを生成する。
 * ブロック中心を通る Catmull-Rom スプラインで滑らかな経路を作る。
 * ループ区間は別途円弧で処理する。
 */
export function buildTrackSpline(
  path: Array<{ x: number; y: number; z: number; blockId: BlockId }>,
): { spline: THREE.CatmullRomCurve3; loops: LoopSegment[]; isLoop: boolean } | null {
  if (path.length < 2) return null;

  const isLoop = path.length > 2 &&
    path[0].x === path[path.length - 1].x &&
    path[0].y === path[path.length - 1].y &&
    path[0].z === path[path.length - 1].z;

  // ループセグメントの検出
  const loops: LoopSegment[] = [];
  const loopColumns = detectLoopColumns(path);
  for (const col of loopColumns) {
    const minY = Math.min(...col.indices.map((i) => path[i].y));
    const maxY = Math.max(...col.indices.map((i) => path[i].y));
    const radius = (maxY - minY + 1) / 2;
    const centerY = (minY + maxY) / 2 + 0.5;
    // ループの進行方向を前後のレールから推定
    const firstIdx = col.indices[0];
    const lastIdx = col.indices[col.indices.length - 1];
    const beforeIdx = Math.max(0, firstIdx - 1);
    const afterIdx = Math.min(path.length - 1, lastIdx + 1);
    const dx = path[afterIdx].x - path[beforeIdx].x;
    const dz = path[afterIdx].z - path[beforeIdx].z;
    const axis = new THREE.Vector3(dx, 0, dz).normalize();
    if (axis.length() < 0.01) axis.set(1, 0, 0);
    loops.push({
      startIdx: firstIdx,
      endIdx: lastIdx,
      center: new THREE.Vector3(path[firstIdx].x + 0.5, centerY, path[firstIdx].z + 0.5),
      radius,
      axis,
    });
  }

  // スプラインポイントの生成（ループ区間は円弧ポイントに置き換え）
  const points: THREE.Vector3[] = [];
  const processedIndices = new Set<number>();

  for (const loop of loops) {
    for (let i = loop.startIdx; i <= loop.endIdx; i++) {
      processedIndices.add(i);
    }
    // 円弧ポイントを生成（ループ区間）
    const arcPoints = generateLoopArcPoints(loop, 16);
    // 開始インデックスにマーク
    if (points.length === 0) {
      // ループ前のレールを追加
      for (let i = 0; i < loop.startIdx; i++) {
        points.push(new THREE.Vector3(path[i].x + 0.5, path[i].y + 0.5, path[i].z + 0.5));
      }
    }
    points.push(...arcPoints);
  }

  // 非ループ区間のポイントを追加
  if (loops.length === 0) {
    for (const p of path) {
      points.push(new THREE.Vector3(p.x + 0.5, p.y + 0.5, p.z + 0.5));
    }
  } else {
    // ループ後の残りのレールを追加
    const lastLoop = loops[loops.length - 1];
    for (let i = lastLoop.endIdx + 1; i < path.length; i++) {
      if (!processedIndices.has(i)) {
        points.push(new THREE.Vector3(path[i].x + 0.5, path[i].y + 0.5, path[i].z + 0.5));
      }
    }
  }

  if (points.length < 2) return null;

  const spline = new THREE.CatmullRomCurve3(points, isLoop, 'catmullrom', 0.5);
  return { spline, loops, isLoop };
}

/** ループ列の検出 — 同じXZ座標に垂直に並ぶRAIL_LOOPブロックを探す */
function detectLoopColumns(
  path: Array<{ x: number; y: number; z: number; blockId: BlockId }>,
): Array<{ x: number; z: number; indices: number[] }> {
  const columns: Array<{ x: number; z: number; indices: number[] }> = [];
  let currentCol: { x: number; z: number; indices: number[] } | null = null;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p.blockId === BLOCK_IDS.RAIL_LOOP) {
      if (currentCol && currentCol.x === p.x && currentCol.z === p.z) {
        currentCol.indices.push(i);
      } else {
        if (currentCol && currentCol.indices.length >= 3) {
          columns.push(currentCol);
        }
        currentCol = { x: p.x, z: p.z, indices: [i] };
      }
    } else {
      if (currentCol && currentCol.indices.length >= 3) {
        columns.push(currentCol);
      }
      currentCol = null;
    }
  }
  if (currentCol && currentCol.indices.length >= 3) {
    columns.push(currentCol);
  }
  return columns;
}

/** ループの円弧ポイントを生成 */
function generateLoopArcPoints(loop: LoopSegment, segments: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  // ループ平面は axis に垂直。up方向が Y 軸。
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, loop.axis).normalize();

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2; // 底から開始
    const px = loop.center.x + right.x * Math.cos(angle) * loop.radius;
    const py = loop.center.y + Math.sin(angle) * loop.radius;
    const pz = loop.center.z + right.z * Math.cos(angle) * loop.radius;
    points.push(new THREE.Vector3(px, py, pz));
  }
  return points;
}

// ─── 物理シミュレーション ─────────────────────────

/** コースター走行状態 */
export interface CoasterRunState {
  /** スプライン上の進行度 0.0〜1.0 */
  progress: number;
  /** 速度 (m/s)。正=前進、負=後退 */
  speed: number;
  /** ブレーキ中か */
  braking: boolean;
}

/** 再利用ベクトル（GC防止） */
const _tangent = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * コースター物理を1フレーム分更新する。
 * @returns 更新後の走行状態と現在のワールド位置・回転
 */
export function updateCoasterPhysics(
  state: CoasterRunState,
  spline: THREE.CatmullRomCurve3,
  trackPath: Array<{ x: number; y: number; z: number; blockId: BlockId }>,
  isLoop: boolean,
  dt: number,
): {
  progress: number;
  speed: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  slopeAngle: number;
} {
  const arcLength = spline.getLength();
  if (arcLength < 0.1) {
    spline.getPointAt(0, _pos);
    return { progress: 0, speed: 0, position: _pos.clone(), tangent: new THREE.Vector3(0, 0, 1), slopeAngle: 0 };
  }

  let { progress, speed, braking } = state;

  // 現在位置のタンジェント（接線）から勾配を取得
  spline.getTangentAt(Math.max(0, Math.min(1, progress)), _tangent);
  const slopeAngle = Math.asin(THREE.MathUtils.clamp(_tangent.y, -1, 1));

  // === 重力による加速: a = g * sin(θ) ===
  // 下り坂(tangent.y < 0, slopeAngle < 0) で speed > 0 なら加速
  // 上り坂(tangent.y > 0, slopeAngle > 0) で speed > 0 なら減速
  const gravityAccel = -COASTER_GRAVITY * Math.sin(slopeAngle);
  speed += gravityAccel * dt;

  // === 摩擦（空気抵抗的） ===
  if (Math.abs(speed) > 0.01) {
    const frictionForce = COASTER_FRICTION * speed * Math.abs(speed);
    speed -= frictionForce * dt;
  }

  // === ブースター加速 ===
  const currentPathIdx = Math.floor(progress * (trackPath.length - 1));
  const safeIdx = Math.max(0, Math.min(trackPath.length - 1, currentPathIdx));
  if (trackPath[safeIdx]?.blockId === BLOCK_IDS.RAIL_BOOSTER) {
    const boostDir = speed >= 0 ? 1 : -1;
    speed += BOOSTER_ACCEL * boostDir * dt;
  }

  // === ブレーキ ===
  if (braking && Math.abs(speed) > 0.1) {
    const brakeDir = speed > 0 ? -1 : 1;
    speed += BRAKE_DECEL * brakeDir * dt;
    // ブレーキで逆方向にならないようにする
    if ((brakeDir > 0 && speed > 0) || (brakeDir < 0 && speed < 0)) {
      speed = 0;
    }
  }

  // === 速度制限 ===
  speed = THREE.MathUtils.clamp(speed, -COASTER_MAX_SPEED, COASTER_MAX_SPEED);

  // === 位置更新 ===
  const progressDelta = (speed * dt) / arcLength;
  progress += progressDelta;

  // 終端処理
  if (isLoop) {
    // 周回コース: 0-1 でラップ
    progress = ((progress % 1) + 1) % 1;
  } else {
    // 開放コース: 端に到達したら反転
    if (progress >= 1) {
      progress = 1;
      speed = 0;
    } else if (progress <= 0) {
      progress = 0;
      speed = 0;
    }
  }

  // 最終位置を取得
  const clampedProgress = Math.max(0, Math.min(1, progress));
  spline.getPointAt(clampedProgress, _pos);
  spline.getTangentAt(clampedProgress, _tangent);

  return {
    progress,
    speed,
    position: _pos.clone(),
    tangent: _tangent.clone(),
    slopeAngle,
  };
}

// ─── レール方向の自動検出 ─────────────────────────

export type RailOrientation = 'ns' | 'ew' | 'curve-ne' | 'curve-nw' | 'curve-se' | 'curve-sw' | 'slope-n' | 'slope-s' | 'slope-e' | 'slope-w';

/**
 * レールブロックの向きを隣接ブロックから自動検出する
 */
export function detectRailOrientation(
  getBlock: GetBlockFn,
  x: number, y: number, z: number,
): RailOrientation {
  const blockId = getBlock(x, y, z);

  // 坂道レールの場合
  if (blockId === BLOCK_IDS.RAIL_SLOPE) {
    // 上1段の水平隣接にレールがあるか
    for (const [dx, , dz] of H_NEIGHBORS) {
      if (isRailBlock(getBlock(x + dx, y + 1, z + dz))) {
        if (dx > 0) return 'slope-e';
        if (dx < 0) return 'slope-w';
        if (dz > 0) return 'slope-s';
        if (dz < 0) return 'slope-n';
      }
    }
    // 下1段の水平隣接にレールがあるか
    for (const [dx, , dz] of H_NEIGHBORS) {
      if (isRailBlock(getBlock(x + dx, y - 1, z + dz))) {
        if (dx > 0) return 'slope-w';
        if (dx < 0) return 'slope-e';
        if (dz > 0) return 'slope-n';
        if (dz < 0) return 'slope-s';
      }
    }
  }

  // 水平隣接のレールを検出
  const hasN = isRailBlock(getBlock(x, y, z - 1));
  const hasS = isRailBlock(getBlock(x, y, z + 1));
  const hasE = isRailBlock(getBlock(x + 1, y, z));
  const hasW = isRailBlock(getBlock(x - 1, y, z));

  // カーブ判定
  if (hasN && hasE && !hasS && !hasW) return 'curve-ne';
  if (hasN && hasW && !hasS && !hasE) return 'curve-nw';
  if (hasS && hasE && !hasN && !hasW) return 'curve-se';
  if (hasS && hasW && !hasN && !hasE) return 'curve-sw';

  // 直線判定
  if (hasE || hasW) return 'ew';
  return 'ns'; // デフォルト
}
