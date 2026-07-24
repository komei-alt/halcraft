// モブのプロシージャル・リグで共有する歩容、足固定、2ボーンIK。
// React の状態更新を使わず、useFrame 内で再利用できるミュータブルなデータだけを扱う。

import * as THREE from 'three';
import { findSurfaceY, type GetBlockFn } from './collision';

/** モブごとの骨格・歩容プロファイル。永続 MobData には保存しない描画専用ID。 */
export type MobRigProfileId =
  | 'prototype_arachnid'
  | 'spider'
  | 'zombie'
  | 'darwin'
  | 'avian'
  | 'brute'
  | 'boss';

export interface MobRigProfile {
  id: MobRigProfileId;
  /** 1周期で進む基準距離（ブロック） */
  strideLength: number;
  /** 周期のうち足を地面に残す割合 */
  stanceRatio: number;
  /** 振り出す足の最高点 */
  footLift: number;
  /** 足を先へ置く距離 */
  stepReach: number;
  /** 胴体の上下動 */
  bodyBob: number;
  /** 胴体の左右ロール */
  bodyRoll: number;
  /** 地形に追従してよい最大段差 */
  maxGroundStep: number;
  /** 停止中の呼吸速度 */
  idleFrequency: number;
  /** 旋回だけで足を踏み替え始める角速度 */
  turnStepThreshold: number;
}

export const MOB_RIG_PROFILES: Readonly<Record<MobRigProfileId, MobRigProfile>> = {
  prototype_arachnid: {
    id: 'prototype_arachnid',
    strideLength: 1.36,
    stanceRatio: 0.68,
    footLift: 0.34,
    stepReach: 0.58,
    bodyBob: 0.06,
    bodyRoll: 0.035,
    maxGroundStep: 0.72,
    idleFrequency: 1.65,
    turnStepThreshold: 0.24,
  },
  spider: {
    id: 'spider',
    strideLength: 0.78,
    stanceRatio: 0.66,
    footLift: 0.16,
    stepReach: 0.26,
    bodyBob: 0.028,
    bodyRoll: 0.04,
    maxGroundStep: 0.42,
    idleFrequency: 1.9,
    turnStepThreshold: 0.3,
  },
  zombie: {
    id: 'zombie',
    strideLength: 1.02,
    stanceRatio: 0.64,
    footLift: 0.18,
    stepReach: 0.38,
    bodyBob: 0.035,
    bodyRoll: 0.055,
    maxGroundStep: 0.52,
    idleFrequency: 1.45,
    turnStepThreshold: 0.3,
  },
  darwin: {
    id: 'darwin',
    strideLength: 1.18,
    stanceRatio: 0.61,
    footLift: 0.24,
    stepReach: 0.46,
    bodyBob: 0.042,
    bodyRoll: 0.045,
    maxGroundStep: 0.58,
    idleFrequency: 1.7,
    turnStepThreshold: 0.28,
  },
  avian: {
    id: 'avian',
    strideLength: 0.46,
    stanceRatio: 0.58,
    footLift: 0.14,
    stepReach: 0.18,
    bodyBob: 0.05,
    bodyRoll: 0.025,
    maxGroundStep: 0.32,
    idleFrequency: 2.35,
    turnStepThreshold: 0.36,
  },
  brute: {
    id: 'brute',
    strideLength: 1.32,
    stanceRatio: 0.72,
    footLift: 0.2,
    stepReach: 0.42,
    bodyBob: 0.045,
    bodyRoll: 0.035,
    maxGroundStep: 0.64,
    idleFrequency: 1.25,
    turnStepThreshold: 0.22,
  },
  boss: {
    id: 'boss',
    strideLength: 1.72,
    stanceRatio: 0.74,
    footLift: 0.22,
    stepReach: 0.5,
    bodyBob: 0.06,
    bodyRoll: 0.028,
    maxGroundStep: 0.75,
    idleFrequency: 1.1,
    turnStepThreshold: 0.18,
  },
};

export interface LocomotionPhaseState {
  /** 0以上1未満の距離ベース位相 */
  phase: number;
  /** 前フレームの向き。旋回踏み替え判定に使う */
  previousRotation: number;
  initialized: boolean;
}

export function createLocomotionPhaseState(initialPhase = 0): LocomotionPhaseState {
  return {
    phase: ((initialPhase % 1) + 1) % 1,
    previousRotation: 0,
    initialized: false,
  };
}

function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * 時刻ではなく実移動距離で歩行位相を進める。
 * FPS変動やAI速度補正があっても足滑りの速度が一定になる。
 */
export function advanceLocomotionPhase(
  state: LocomotionPhaseState,
  input: {
    speed: number;
    delta: number;
    rotation: number;
    moving: boolean;
    profile: MobRigProfile;
  },
): number {
  const dt = THREE.MathUtils.clamp(input.delta, 0, 0.08);
  if (!state.initialized) {
    state.previousRotation = input.rotation;
    state.initialized = true;
  }

  const turnRate = Math.abs(shortestAngleDelta(state.previousRotation, input.rotation)) / Math.max(dt, 1 / 240);
  state.previousRotation = input.rotation;
  const travel = input.moving ? Math.max(0, input.speed) : 0;
  const turnTravel = turnRate > input.profile.turnStepThreshold
    ? (turnRate - input.profile.turnStepThreshold) * 0.12
    : 0;
  const phaseDelta = (travel + turnTravel) * dt / Math.max(0.05, input.profile.strideLength);
  state.phase = (state.phase + phaseDelta) % 1;
  return state.phase;
}

export interface GaitSample {
  /** true の間だけ足を持ち上げる */
  swinging: boolean;
  /** 接地=0、振り出し=0..1 */
  swingProgress: number;
  /** +1が前、-1が後ろ */
  stride: number;
  /** 0..1の足上げカーブ */
  lift: number;
  /** 0..1の接地ウェイト */
  plantedWeight: number;
}

function smooth01(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 1本の足の位相から、スタンスとスイングの滑らかな曲線を返す。 */
export function sampleGait(
  basePhase: number,
  phaseOffset: number,
  profile: MobRigProfile,
): GaitSample {
  const phase = ((basePhase + phaseOffset) % 1 + 1) % 1;
  if (phase < profile.stanceRatio) {
    const u = smooth01(phase / profile.stanceRatio);
    const edge = Math.min(1, Math.min(u, 1 - u) * 10);
    return {
      swinging: false,
      swingProgress: 0,
      stride: THREE.MathUtils.lerp(1, -1, u),
      lift: 0,
      plantedWeight: smooth01(edge),
    };
  }

  const u = smooth01((phase - profile.stanceRatio) / (1 - profile.stanceRatio));
  return {
    swinging: true,
    swingProgress: u,
    stride: THREE.MathUtils.lerp(-1, 1, u),
    lift: Math.sin(u * Math.PI),
    plantedWeight: 0,
  };
}

export interface FootPlantState {
  position: THREE.Vector3;
  swingStart: THREE.Vector3;
  swingTarget: THREE.Vector3;
  wasSwinging: boolean;
  initialized: boolean;
}

export function createFootPlantState(): FootPlantState {
  return {
    position: new THREE.Vector3(),
    swingStart: new THREE.Vector3(),
    swingTarget: new THREE.Vector3(),
    wasSwinging: false,
    initialized: false,
  };
}

/**
 * スタンス中はワールド座標へ足を固定し、スイング中だけ次の接地点へ運ぶ。
 * restWorld と nextWorld は呼び出し側のスクラッチ Vector3 をそのまま渡せる。
 */
export function updatePlantedFoot(
  state: FootPlantState,
  input: {
    gait: GaitSample;
    restWorld: THREE.Vector3;
    nextWorld: THREE.Vector3;
    groundY: number;
    lift: number;
    moving: boolean;
    delta: number;
  },
): THREE.Vector3 {
  if (!state.initialized) {
    state.position.copy(input.restWorld);
    state.position.y = input.groundY;
    state.swingStart.copy(state.position);
    state.swingTarget.copy(state.position);
    state.initialized = true;
  }

  if (!input.moving) {
    const settle = 1 - Math.exp(-Math.min(input.delta, 0.08) * 10);
    state.position.lerp(input.restWorld, settle);
    state.position.y = THREE.MathUtils.lerp(state.position.y, input.groundY, settle);
    state.swingStart.copy(state.position);
    state.swingTarget.copy(state.position);
    state.wasSwinging = false;
    return state.position;
  }

  if (input.gait.swinging && !state.wasSwinging) {
    state.swingStart.copy(state.position);
    state.swingTarget.copy(input.nextWorld);
    state.swingTarget.y = input.groundY;
  } else if (input.gait.swinging) {
    // 予測接地点は急に飛ばさず、動いている胴体へ少しずつ追従させる。
    state.swingTarget.lerp(input.nextWorld, 0.22);
    state.swingTarget.y = THREE.MathUtils.lerp(state.swingTarget.y, input.groundY, 0.35);
  }

  if (input.gait.swinging) {
    const u = input.gait.swingProgress;
    state.position.lerpVectors(state.swingStart, state.swingTarget, u);
    state.position.y += input.gait.lift * input.lift;
  } else if (state.wasSwinging) {
    state.position.copy(state.swingTarget);
    state.position.y = input.groundY;
  } else {
    // 固定中も壊した/置いたブロックには追従するが、XZは動かさない。
    state.position.y = THREE.MathUtils.lerp(state.position.y, input.groundY, 0.28);
  }

  state.wasSwinging = input.gait.swinging;
  return state.position;
}

export interface TwoBoneIkResult {
  knee: THREE.Vector3;
  foot: THREE.Vector3;
  stretch: number;
}

const IK_DIRECTION = new THREE.Vector3();
const IK_POLE = new THREE.Vector3();

/**
 * 3Dの解析的2ボーンIK。poleDirection 側へ膝を曲げる。
 * out の Vector3 を再利用するため、毎フレームのGCを発生させない。
 */
export function solveTwoBoneIK(
  hip: THREE.Vector3,
  target: THREE.Vector3,
  poleDirection: THREE.Vector3,
  upperLength: number,
  lowerLength: number,
  out: TwoBoneIkResult,
): TwoBoneIkResult {
  IK_DIRECTION.subVectors(target, hip);
  const rawDistance = IK_DIRECTION.length();
  const minDistance = Math.max(0.001, Math.abs(upperLength - lowerLength) + 0.001);
  const maxDistance = Math.max(minDistance, upperLength + lowerLength - 0.001);
  const distance = THREE.MathUtils.clamp(rawDistance, minDistance, maxDistance);
  if (rawDistance < 1e-6) IK_DIRECTION.set(0, -1, 0);
  else IK_DIRECTION.multiplyScalar(1 / rawDistance);

  IK_POLE.copy(poleDirection).addScaledVector(IK_DIRECTION, -poleDirection.dot(IK_DIRECTION));
  if (IK_POLE.lengthSq() < 1e-8) {
    IK_POLE.set(0, 1, 0).cross(IK_DIRECTION);
    if (IK_POLE.lengthSq() < 1e-8) IK_POLE.set(1, 0, 0);
  }
  IK_POLE.normalize();

  const along = (
    upperLength * upperLength
    - lowerLength * lowerLength
    + distance * distance
  ) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  out.knee.copy(hip)
    .addScaledVector(IK_DIRECTION, along)
    .addScaledVector(IK_POLE, height);
  out.foot.copy(hip).addScaledVector(IK_DIRECTION, distance);
  out.stretch = maxDistance > 0 ? rawDistance / maxDistance : 1;
  return out;
}

/** 足先直下のブロック上面。未生成地形では基準Yへフォールバックする。 */
export function sampleRigSurfaceY(
  getBlock: GetBlockFn,
  x: number,
  z: number,
  baseY: number,
  maxGroundStep: number,
): number {
  const surface = findSurfaceY(getBlock, x, z, baseY + maxGroundStep + 1, 6, baseY);
  return THREE.MathUtils.clamp(surface, baseY - maxGroundStep, baseY + maxGroundStep);
}

/** 複数の接地足から胴体の安定化量を求める。 */
export function computeBodyStabilization(
  footHeights: readonly number[],
  baseY: number,
  profile: MobRigProfile,
  phase: number,
): { lift: number; bob: number } {
  if (footHeights.length === 0) return { lift: 0, bob: 0 };
  let sum = 0;
  for (const height of footHeights) sum += height - baseY;
  const lift = THREE.MathUtils.clamp(sum / footHeights.length, -profile.maxGroundStep, profile.maxGroundStep) * 0.42;
  const bob = Math.sin(phase * Math.PI * 2) * profile.bodyBob;
  return { lift, bob };
}

const SEGMENT_X_AXIS = new THREE.Vector3(1, 0, 0);
const SEGMENT_DIRECTION = new THREE.Vector3();

/** X方向が長さ1のBoxGeometryを2点間の骨へ変換する。 */
export function setSegmentTransform(
  object: THREE.Object3D,
  start: THREE.Vector3,
  end: THREE.Vector3,
  thickness: number,
): void {
  SEGMENT_DIRECTION.subVectors(end, start);
  const length = Math.max(0.001, SEGMENT_DIRECTION.length());
  SEGMENT_DIRECTION.multiplyScalar(1 / length);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(SEGMENT_X_AXIS, SEGMENT_DIRECTION);
  object.scale.set(length, thickness, thickness);
  object.updateMatrix();
}
