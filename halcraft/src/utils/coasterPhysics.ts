// ======================================================
// ジェットコースター物理エンジン v2
// ======================================================
// 正確な物理法則に基づくシミュレーション:
//   - エネルギー保存（位置エネルギー ⇔ 運動エネルギー）
//   - 転がり抵抗（速度に比例する摩擦力）
//   - 空気抵抗（速度の2乗に比例する抗力）
//   - チェーンリフト（段階的な一定速度上昇）
//   - ループの遠心力チェック
//   - レール接続の自動検出とスプライン補間

import * as THREE from 'three';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import type { GetBlockFn } from './collision';

// ═══════════════════════════════════════════════════════
// 物理定数（現実スケールを参考にゲーム用に調整）
// ═══════════════════════════════════════════════════════

/** 重力加速度 (m/s²) — プレイヤー物理の |GRAVITY|=25 と一致 */
export const COASTER_GRAVITY = 25;

/** 転がり抵抗係数 — 鋼車輪 on 鋼レール: 実際は ~0.001 だがゲーム用に増幅 */
export const ROLLING_RESISTANCE = 0.08;

/** 空気抵抗係数 — ½ρCdA / m（簡略化: 速度²に掛ける係数） */
export const AIR_DRAG = 0.004;

/** チェーンリフトの巻き上げ速度 (m/s) — 実際のジェットコースターは ~2-5 m/s */
export const CHAIN_LIFT_SPEED = 3.5;

/** チェーンリフトのガチャガチャ周期 (秒) — 歯車1つ分 */
export const CHAIN_RATCHET_PERIOD = 0.12;

/** チェーンリフトのガチャガチャ振幅 (速度の変動幅 m/s) */
export const CHAIN_RATCHET_AMPLITUDE = 0.6;

/** 最大速度 (m/s) — 安全上の上限 */
export const COASTER_MAX_SPEED = 40;

/** ブースターレールの加速力 (m/s²) */
export const BOOSTER_ACCEL = 18;

/** ブレーキ減速力 (m/s²) */
export const BRAKE_DECEL = 14;

/** ループ通過に必要な最小速度 (m/s) — √(gR) から算出 */
export const LOOP_MIN_SPEED = 8;

/** カート搭乗距離 */
export const CART_BOARD_DISTANCE = 3;

/** 停止閾値 — この速度以下で完全停止 */
export const STOP_THRESHOLD = 0.05;

// ═══════════════════════════════════════════════════════
// ヘルパー
// ═══════════════════════════════════════════════════════

/** ブロックがレール系か判定 */
export function isRailBlock(blockId: BlockId): boolean {
  return (
    blockId === BLOCK_IDS.RAIL ||
    blockId === BLOCK_IDS.RAIL_SLOPE ||
    blockId === BLOCK_IDS.RAIL_BOOSTER ||
    blockId === BLOCK_IDS.RAIL_LOOP ||
    blockId === BLOCK_IDS.RAIL_CHAIN
  );
}

/** 坂道を含む隣接オフセット（水平+上下1段） */
const SLOPE_NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
  [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
];

/** 4方向の水平隣接オフセット */
const H_NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];

// ═══════════════════════════════════════════════════════
// レール経路構築（BFS → 順序付きパス）
// ═══════════════════════════════════════════════════════

function posKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function findNeighborRails(
  getBlock: GetBlockFn, x: number, y: number, z: number,
): Array<[number, number, number]> {
  const results: Array<[number, number, number]> = [];
  for (const [dx, dy, dz] of SLOPE_NEIGHBORS) {
    if (isRailBlock(getBlock(x + dx, y + dy, z + dz))) {
      results.push([x + dx, y + dy, z + dz]);
    }
  }
  return results;
}

export function buildTrackPath(
  getBlock: GetBlockFn,
  startX: number, startY: number, startZ: number,
): Array<{ x: number; y: number; z: number; blockId: BlockId }> {
  if (!isRailBlock(getBlock(startX, startY, startZ))) return [];

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

  // 端点を探す
  let endpointKey: string | null = null;
  for (const [key, neighbors] of adjMap) {
    if (neighbors.length <= 1) {
      endpointKey = key;
      break;
    }
  }

  const startKey = endpointKey ?? posKey(startX, startY, startZ);
  const path: Array<{ x: number; y: number; z: number; blockId: BlockId }> = [];
  const walked = new Set<string>();
  const [sx, sy, sz] = startKey.split(',').map(Number);
  let current: [number, number, number] = [sx, sy, sz];

  while (true) {
    const key = posKey(current[0], current[1], current[2]);
    if (walked.has(key)) break;
    walked.add(key);
    const blockId = getBlock(current[0], current[1], current[2]);
    path.push({ x: current[0], y: current[1], z: current[2], blockId });

    const neighbors = adjMap.get(key);
    if (!neighbors) break;
    const next = neighbors.find((n) => !walked.has(posKey(n[0], n[1], n[2])));
    if (!next) {
      if (path.length > 2) {
        const firstNeighbors = adjMap.get(posKey(path[0].x, path[0].y, path[0].z));
        if (firstNeighbors?.some((n) => posKey(n[0], n[1], n[2]) === key)) {
          path.push({ ...path[0] });
        }
      }
      break;
    }
    current = next;
  }

  return path;
}

// ═══════════════════════════════════════════════════════
// スプライン生成（ループ円弧対応）
// ═══════════════════════════════════════════════════════

export interface LoopSegment {
  startIdx: number;
  endIdx: number;
  center: THREE.Vector3;
  radius: number;
  axis: THREE.Vector3;
}

export function buildTrackSpline(
  path: Array<{ x: number; y: number; z: number; blockId: BlockId }>,
): { spline: THREE.CatmullRomCurve3; loops: LoopSegment[]; isLoop: boolean } | null {
  if (path.length < 2) return null;

  const isLoop = path.length > 2 &&
    path[0].x === path[path.length - 1].x &&
    path[0].y === path[path.length - 1].y &&
    path[0].z === path[path.length - 1].z;

  const loops: LoopSegment[] = [];
  const loopColumns = detectLoopColumns(path);
  for (const col of loopColumns) {
    const minY = Math.min(...col.indices.map((i) => path[i].y));
    const maxY = Math.max(...col.indices.map((i) => path[i].y));
    const radius = (maxY - minY + 1) / 2;
    const centerY = (minY + maxY) / 2 + 0.5;
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

  const points: THREE.Vector3[] = [];
  const processedIndices = new Set<number>();

  for (const loop of loops) {
    for (let i = loop.startIdx; i <= loop.endIdx; i++) {
      processedIndices.add(i);
    }
    const arcPoints = generateLoopArcPoints(loop, 16);
    if (points.length === 0) {
      for (let i = 0; i < loop.startIdx; i++) {
        points.push(new THREE.Vector3(path[i].x + 0.5, path[i].y + 0.5, path[i].z + 0.5));
      }
    }
    points.push(...arcPoints);
  }

  if (loops.length === 0) {
    for (const p of path) {
      points.push(new THREE.Vector3(p.x + 0.5, p.y + 0.5, p.z + 0.5));
    }
  } else {
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
        if (currentCol && currentCol.indices.length >= 3) columns.push(currentCol);
        currentCol = { x: p.x, z: p.z, indices: [i] };
      }
    } else {
      if (currentCol && currentCol.indices.length >= 3) columns.push(currentCol);
      currentCol = null;
    }
  }
  if (currentCol && currentCol.indices.length >= 3) columns.push(currentCol);
  return columns;
}

function generateLoopArcPoints(loop: LoopSegment, segments: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, loop.axis).normalize();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
    const px = loop.center.x + right.x * Math.cos(angle) * loop.radius;
    const py = loop.center.y + Math.sin(angle) * loop.radius;
    const pz = loop.center.z + right.z * Math.cos(angle) * loop.radius;
    points.push(new THREE.Vector3(px, py, pz));
  }
  return points;
}

// ═══════════════════════════════════════════════════════
// 物理シミュレーション v2（エネルギー保存モデル）
// ═══════════════════════════════════════════════════════

/** コースター走行状態 */
export interface CoasterRunState {
  /** スプライン上の進行度 0.0〜1.0 */
  progress: number;
  /** 速度 (m/s)。正=前進、負=後退 */
  speed: number;
  /** ブレーキ中か */
  braking: boolean;
  /** チェーンリフト走行中か */
  onChainLift: boolean;
  /** チェーンリフトのラチェットタイマー */
  chainRatchetTimer: number;
}

/** 再利用ベクトル（GC防止） */
const _tangent = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * 正確な物理シミュレーションで1フレーム分更新する。
 *
 * 物理モデル:
 *   F_gravity  = m·g·sin(θ)     … 重力の勾配成分
 *   F_rolling  = μ_r · m·g      … 転がり抵抗（速度に依存しない定常項）
 *   F_air      = ½ρCdA · v²     … 空気抵抗（速度の2乗に比例）
 *   F_brake    = 定数            … ブレーキ力
 *   F_chain    = チェーンリフト速度に追従する制御力
 *
 *   a = F_gravity/m - sign(v)·F_rolling/m - sign(v)·F_air·v²/m + ...
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
  onChainLift: boolean;
  chainRatchetTimer: number;
  kineticEnergy: number;
  potentialEnergy: number;
  gForce: number;
} {
  const arcLength = spline.getLength();
  if (arcLength < 0.1) {
    spline.getPointAt(0, _pos);
    return {
      progress: 0, speed: 0, position: _pos.clone(),
      tangent: new THREE.Vector3(0, 0, 1), slopeAngle: 0,
      onChainLift: false, chainRatchetTimer: 0,
      kineticEnergy: 0, potentialEnergy: 0, gForce: 1,
    };
  }

  let { progress, speed, braking, chainRatchetTimer } = state;

  // ─── 現在位置の勾配を取得 ────────────────────────
  const clampedP = Math.max(0, Math.min(1, progress));
  spline.getTangentAt(clampedP, _tangent);
  const slopeAngle = Math.asin(THREE.MathUtils.clamp(_tangent.y, -1, 1));

  // ─── 現在のレールブロック種別を取得 ──────────────
  const currentPathIdx = Math.floor(clampedP * (trackPath.length - 1));
  const safeIdx = Math.max(0, Math.min(trackPath.length - 1, currentPathIdx));
  const currentBlockId = trackPath[safeIdx]?.blockId ?? BLOCK_IDS.RAIL;

  // ═════ チェーンリフト制御 ═════
  const isOnChain = currentBlockId === BLOCK_IDS.RAIL_CHAIN;

  if (isOnChain) {
    // チェーンリフト: 一定速度で牽引（ガチャガチャ音の再現）
    chainRatchetTimer += dt;
    if (chainRatchetTimer >= CHAIN_RATCHET_PERIOD) {
      chainRatchetTimer -= CHAIN_RATCHET_PERIOD;
    }

    // ガチャガチャ動作: サイン波で速度を微妙に変動させる
    const ratchetPhase = chainRatchetTimer / CHAIN_RATCHET_PERIOD;
    const ratchetWobble = Math.sin(ratchetPhase * Math.PI * 2) * CHAIN_RATCHET_AMPLITUDE;
    const targetSpeed = CHAIN_LIFT_SPEED + ratchetWobble;

    // チェーン力: 目標速度に向けてスムーズに追従
    const chainForce = (targetSpeed - speed) * 10; // PD制御的な追従
    speed += chainForce * dt;

    // チェーンリフト中は重力による後退を防止
    if (speed < 0.5) speed = 0.5;
  } else {
    chainRatchetTimer = 0;

    // ═════ 1. 重力による加速 ═════
    // F = m·g·sin(θ)   →   a = g·sin(θ)
    // 下り坂（θ<0）で前進加速、上り坂（θ>0）で減速
    const gravityAccel = -COASTER_GRAVITY * Math.sin(slopeAngle);
    speed += gravityAccel * dt;

    // ═════ 2. 転がり抵抗 ═════
    // F_rolling = μ_r · m·g·cos(θ)   →   a = μ_r · g·cos(θ)
    // 平坦面でも常に運動方向と逆に作用 → 段階的に停止
    if (Math.abs(speed) > STOP_THRESHOLD) {
      const rollingDecel = ROLLING_RESISTANCE * COASTER_GRAVITY * Math.cos(slopeAngle);
      const rollingForce = rollingDecel * dt;
      if (Math.abs(speed) <= rollingForce) {
        speed = 0; // 転がり抵抗で完全停止
      } else {
        speed -= Math.sign(speed) * rollingForce;
      }
    } else if (Math.abs(gravityAccel) < ROLLING_RESISTANCE * COASTER_GRAVITY * 0.5) {
      // 微速 + ほぼ平坦 → 停止
      speed = 0;
    }

    // ═════ 3. 空気抵抗 ═════
    // F_air = ½ρCdA · v²   →   a = C_drag · v²
    // 高速時ほど強く減速
    if (Math.abs(speed) > 0.1) {
      const airDragForce = AIR_DRAG * speed * Math.abs(speed);
      speed -= airDragForce * dt;
    }

    // ═════ 4. ブースター加速 ═════
    if (currentBlockId === BLOCK_IDS.RAIL_BOOSTER) {
      const boostDir = speed >= 0 ? 1 : -1;
      speed += BOOSTER_ACCEL * boostDir * dt;
    }
  }

  // ═════ 5. ブレーキ ═════
  if (braking && Math.abs(speed) > STOP_THRESHOLD) {
    const brakeDir = speed > 0 ? -1 : 1;
    const brakeForce = BRAKE_DECEL * dt;
    if (Math.abs(speed) <= brakeForce) {
      speed = 0;
    } else {
      speed += brakeDir * brakeForce;
    }
  }

  // ═════ 6. 速度制限 ═════
  speed = THREE.MathUtils.clamp(speed, -COASTER_MAX_SPEED, COASTER_MAX_SPEED);

  // ═════ 7. 位置更新 ═════
  const progressDelta = (speed * dt) / arcLength;
  progress += progressDelta;

  // 終端処理
  if (isLoop) {
    progress = ((progress % 1) + 1) % 1;
  } else {
    if (progress >= 1) { progress = 1; speed = 0; }
    else if (progress <= 0) { progress = 0; speed = 0; }
  }

  // ═════ 8. 最終位置と物理量の算出 ═════
  const finalP = Math.max(0, Math.min(1, progress));
  spline.getPointAt(finalP, _pos);
  spline.getTangentAt(finalP, _tangent);

  // 運動エネルギー: KE = ½mv² (m=1として正規化)
  const kineticEnergy = 0.5 * speed * speed;

  // 位置エネルギー: PE = mgh (m=1, h=現在の高さ)
  const potentialEnergy = COASTER_GRAVITY * _pos.y;

  // G力の推定（法線加速度 + 重力）
  // 通常走行時は ~1G、ループ頂点では遠心力により変化
  const centripetal = speed * speed; // 曲率半径の逆数 × v² ≈ v²（簡略化）
  const normalAccel = centripetal * Math.abs(_tangent.y); // 法線方向加速度の近似
  const gForce = 1 + normalAccel / COASTER_GRAVITY;

  return {
    progress,
    speed,
    position: _pos.clone(),
    tangent: _tangent.clone(),
    slopeAngle,
    onChainLift: isOnChain,
    chainRatchetTimer,
    kineticEnergy,
    potentialEnergy,
    gForce,
  };
}

// ═══════════════════════════════════════════════════════
// レール方向の自動検出
// ═══════════════════════════════════════════════════════

export type RailOrientation =
  | 'ns' | 'ew'
  | 'curve-ne' | 'curve-nw' | 'curve-se' | 'curve-sw'
  | 'slope-n' | 'slope-s' | 'slope-e' | 'slope-w';

export function detectRailOrientation(
  getBlock: GetBlockFn,
  x: number, y: number, z: number,
): RailOrientation {
  const blockId = getBlock(x, y, z);

  // 坂道レール・チェーンリフトの場合
  if (blockId === BLOCK_IDS.RAIL_SLOPE || blockId === BLOCK_IDS.RAIL_CHAIN) {
    for (const [dx, , dz] of H_NEIGHBORS) {
      if (isRailBlock(getBlock(x + dx, y + 1, z + dz))) {
        if (dx > 0) return 'slope-e';
        if (dx < 0) return 'slope-w';
        if (dz > 0) return 'slope-s';
        if (dz < 0) return 'slope-n';
      }
    }
    for (const [dx, , dz] of H_NEIGHBORS) {
      if (isRailBlock(getBlock(x + dx, y - 1, z + dz))) {
        if (dx > 0) return 'slope-w';
        if (dx < 0) return 'slope-e';
        if (dz > 0) return 'slope-n';
        if (dz < 0) return 'slope-s';
      }
    }
  }

  // 水平隣接のレールを検出（同一Y + 上下1段も含む）
  const hasN = isRailBlock(getBlock(x, y, z - 1))
    || isRailBlock(getBlock(x, y + 1, z - 1))
    || isRailBlock(getBlock(x, y - 1, z - 1));
  const hasS = isRailBlock(getBlock(x, y, z + 1))
    || isRailBlock(getBlock(x, y + 1, z + 1))
    || isRailBlock(getBlock(x, y - 1, z + 1));
  const hasE = isRailBlock(getBlock(x + 1, y, z))
    || isRailBlock(getBlock(x + 1, y + 1, z))
    || isRailBlock(getBlock(x + 1, y - 1, z));
  const hasW = isRailBlock(getBlock(x - 1, y, z))
    || isRailBlock(getBlock(x - 1, y + 1, z))
    || isRailBlock(getBlock(x - 1, y - 1, z));

  const count = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);

  // ── 2方向（L字）: 確実にカーブ ──
  if (count === 2) {
    if (hasN && hasE) return 'curve-ne';
    if (hasN && hasW) return 'curve-nw';
    if (hasS && hasE) return 'curve-se';
    if (hasS && hasW) return 'curve-sw';
  }

  // ── 3方向（T字）: 端点に近い2方向でカーブ判定 ──
  // T字の場合、直線方向を優先（通過レール）し、曲がる方をカーブにしない
  // ただし、一般的にはT字は直線として描画する
  if (count >= 3) {
    // NS直線が主線なら直線
    if (hasN && hasS) return 'ns';
    // EW直線が主線なら直線
    if (hasE && hasW) return 'ew';
    // 主線が無い場合はカーブ
    if (hasN && hasE) return 'curve-ne';
    if (hasN && hasW) return 'curve-nw';
    if (hasS && hasE) return 'curve-se';
    if (hasS && hasW) return 'curve-sw';
  }

  // ── 直線判定 ──
  if (hasE || hasW) return 'ew';
  return 'ns';
}

