// 静的GLB（骨なし）から人型スケルトンを自動生成し、
// 歩行・待機・被ダメなどのプロシージャルアニメを駆動する

import * as THREE from 'three';
import { buildPrototypeMultipartRig } from './mobPrototypeRig';
import { buildRigidPartMobRig } from './mobRigidPartRig';
import {
  MOB_RIG_PROFILES,
  advanceLocomotionPhase,
  createLocomotionPhaseState,
  sampleGait,
  type MobRigProfileId,
} from './mobRigMotion';
import type { GetBlockFn } from './collision';

export type { MobRigProfileId } from './mobRigMotion';

/** アニメーション入力 */
export interface MobRigAnimState {
  /** 経過時間（秒） */
  time: number;
  /** フレーム時間。距離ベース歩容に使う */
  delta?: number;
  /** 移動中か */
  moving: boolean;
  /** 水平速度（ブロック/秒） */
  speed: number;
  /** 被ダメ残り時間（秒） */
  hitTimer: number;
  /** ヒット方向（ワールド水平・正規化）。ひるみの向きに使う */
  hitDirX?: number;
  hitDirZ?: number;
  /** 攻撃モーション残り時間（秒）。0 で非攻撃 */
  attackTimer?: number;
  /** 攻撃モーション全体の長さ（秒）。progress 計算用 */
  attackDuration?: number;
  /** 怒り状態 */
  angry: boolean;
  /** 味方か（アニメのトーンを少し変える） */
  ally?: boolean;
  /** モブのワールド向きと座標（接地・旋回踏み替え用） */
  rotation?: number;
  worldX?: number;
  worldY?: number;
  worldZ?: number;
  /** GLBモデルのルート変換 */
  modelScale?: number;
  modelYaw?: number;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
  anchorOffsetZ?: number;
  /** 左右の足元地形差。モデルローカル単位。 */
  leftFootGroundOffset?: number;
  rightFootGroundOffset?: number;
  /** 多脚リグが各足の直下を調べるためのブロック取得関数 */
  getBlock?: GetBlockFn;
  /** 0=近距離、1=中距離、2=遠距離 */
  lod?: 0 | 1 | 2;
}

export interface ProceduralMobRig {
  /** シーンに追加するルート */
  root: THREE.Group;
  /** 毎フレーム呼ぶ */
  update: (state: MobRigAnimState) => void;
  /** マテリアル走査（被ダメ色など） */
  traverseMaterials: (fn: (mat: THREE.Material) => void) => void;
  dispose: () => void;
}

const BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'L_upperLeg',
  'L_lowerLeg',
  'L_foot',
  'R_upperLeg',
  'R_lowerLeg',
  'R_foot',
  'L_upperArm',
  'L_lowerArm',
  'R_upperArm',
  'R_lowerArm',
] as const;

type BoneName = (typeof BONE_NAMES)[number];

interface BoneDef {
  name: BoneName;
  parent: BoneName | null;
  /** バウンディングボックス相対位置 (0-1) */
  pos: [number, number, number];
}

/** 人型の骨配置（正規化座標: x=0.5中心, y=0足元→1頭, z=0.5中心） */
const HUMANOID_BONES: BoneDef[] = [
  { name: 'hips', parent: null, pos: [0.5, 0.48, 0.5] },
  { name: 'spine', parent: 'hips', pos: [0.5, 0.58, 0.5] },
  { name: 'chest', parent: 'spine', pos: [0.5, 0.70, 0.5] },
  { name: 'neck', parent: 'chest', pos: [0.5, 0.84, 0.5] },
  { name: 'head', parent: 'neck', pos: [0.5, 0.94, 0.5] },
  { name: 'L_upperLeg', parent: 'hips', pos: [0.38, 0.42, 0.5] },
  { name: 'L_lowerLeg', parent: 'L_upperLeg', pos: [0.38, 0.22, 0.5] },
  { name: 'L_foot', parent: 'L_lowerLeg', pos: [0.38, 0.04, 0.55] },
  { name: 'R_upperLeg', parent: 'hips', pos: [0.62, 0.42, 0.5] },
  { name: 'R_lowerLeg', parent: 'R_upperLeg', pos: [0.62, 0.22, 0.5] },
  { name: 'R_foot', parent: 'R_lowerLeg', pos: [0.62, 0.04, 0.55] },
  { name: 'L_upperArm', parent: 'chest', pos: [0.22, 0.74, 0.5] },
  { name: 'L_lowerArm', parent: 'L_upperArm', pos: [0.12, 0.58, 0.5] },
  { name: 'R_upperArm', parent: 'chest', pos: [0.78, 0.74, 0.5] },
  { name: 'R_lowerArm', parent: 'R_upperArm', pos: [0.88, 0.58, 0.5] },
];

interface StyleParams {
  walkAmp: number;
  armAmp: number;
  idleAmp: number;
  kneeAmp: number;
  /** ゾンビ腕の前方固定角度 */
  armForward: number;
  walkFreq: number;
  heavy: number;
}

function getStyleParams(style: MobRigProfileId): StyleParams {
  switch (style) {
    case 'zombie':
      return {
        walkAmp: 0.55,
        armAmp: 0.22,
        idleAmp: 0.04,
        kneeAmp: 0.55,
        armForward: 1.15,
        walkFreq: 5.2,
        heavy: 0.85,
      };
    case 'brute':
      return {
        walkAmp: 0.38,
        armAmp: 0.28,
        idleAmp: 0.03,
        kneeAmp: 0.42,
        armForward: 0.25,
        walkFreq: 3.6,
        heavy: 1.2,
      };
    case 'avian':
      return {
        walkAmp: 0.7,
        armAmp: 0.9,
        idleAmp: 0.08,
        kneeAmp: 0.75,
        armForward: 0.1,
        walkFreq: 9.5,
        heavy: 0.55,
      };
    case 'darwin':
    default:
      return {
        walkAmp: 0.58,
        armAmp: 0.55,
        idleAmp: 0.05,
        kneeAmp: 0.58,
        armForward: 0.1,
        walkFreq: 6.2,
        heavy: 1,
      };
  }
}

/** smoothstep 0→1 */
function smooth01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * 攻撃モーションの位相（0-1 progress から各部位の係数を返す）
 * 0.00–0.28: 溜め / 0.28–0.48: 振り下ろし / 0.48–0.68: インパクト / 0.68–1.00: 戻し
 */
function attackPose(progress: number): {
  torsoPitch: number;
  torsoYaw: number;
  headPitch: number;
  armRaise: number;
  armSwing: number;
  elbow: number;
  hipTwist: number;
  lunge: number;
} {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p < 0.28) {
    const u = smooth01(p / 0.28);
    return {
      torsoPitch: -0.18 * u,
      torsoYaw: -0.22 * u,
      headPitch: 0.1 * u,
      armRaise: 1.35 * u,
      armSwing: -0.55 * u,
      elbow: 0.55 * u,
      hipTwist: -0.12 * u,
      lunge: -0.04 * u,
    };
  }
  if (p < 0.48) {
    const u = smooth01((p - 0.28) / 0.2);
    return {
      torsoPitch: THREE.MathUtils.lerp(-0.18, 0.32, u),
      torsoYaw: THREE.MathUtils.lerp(-0.22, 0.28, u),
      headPitch: THREE.MathUtils.lerp(0.1, -0.12, u),
      armRaise: THREE.MathUtils.lerp(1.35, -0.15, u),
      armSwing: THREE.MathUtils.lerp(-0.55, 1.45, u),
      elbow: THREE.MathUtils.lerp(0.55, 0.15, u),
      hipTwist: THREE.MathUtils.lerp(-0.12, 0.18, u),
      lunge: THREE.MathUtils.lerp(-0.04, 0.12, u),
    };
  }
  if (p < 0.68) {
    const u = smooth01((p - 0.48) / 0.2);
    return {
      torsoPitch: THREE.MathUtils.lerp(0.32, 0.22, u),
      torsoYaw: THREE.MathUtils.lerp(0.28, 0.18, u),
      headPitch: THREE.MathUtils.lerp(-0.12, -0.05, u),
      armRaise: THREE.MathUtils.lerp(-0.15, -0.05, u),
      armSwing: THREE.MathUtils.lerp(1.45, 1.2, u),
      elbow: THREE.MathUtils.lerp(0.15, 0.35, u),
      hipTwist: THREE.MathUtils.lerp(0.18, 0.1, u),
      lunge: THREE.MathUtils.lerp(0.12, 0.06, u),
    };
  }
  const u = smooth01((p - 0.68) / 0.32);
  return {
    torsoPitch: THREE.MathUtils.lerp(0.22, 0, u),
    torsoYaw: THREE.MathUtils.lerp(0.18, 0, u),
    headPitch: THREE.MathUtils.lerp(-0.05, 0, u),
    armRaise: THREE.MathUtils.lerp(-0.05, 0, u),
    armSwing: THREE.MathUtils.lerp(1.2, 0, u),
    elbow: THREE.MathUtils.lerp(0.35, 0.1, u),
    hipTwist: THREE.MathUtils.lerp(0.1, 0, u),
    lunge: THREE.MathUtils.lerp(0.06, 0, u),
  };
}

function cloneMaterial(mat: THREE.Material): THREE.Material {
  const cloned = mat.clone();
  cloned.depthWrite = true;
  cloned.depthTest = true;
  return cloned;
}

function findMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      meshes.push(child);
    }
  });
  return meshes;
}

function worldBoxFromMesh(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateWorldMatrix(true, false);
  const geo = mesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!.clone();
  box.applyMatrix4(mesh.matrixWorld);
  return box;
}

function combinedBox(meshes: THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    box.union(worldBoxFromMesh(mesh));
  }
  return box;
}

/**
 * 頂点位置から最大4本の骨にウェイトを割る
 * 人型の部位（頭・胴・腕・脚）を Y/X で推定
 */
function paintVertexWeights(
  x: number,
  y: number,
  z: number,
  box: THREE.Box3,
  boneIndex: Record<BoneName, number>,
  style: MobRigProfileId,
): { indices: [number, number, number, number]; weights: [number, number, number, number] } {
  const size = new THREE.Vector3();
  box.getSize(size);
  const min = box.min;
  const nx = size.x > 1e-6 ? (x - min.x) / size.x : 0.5;
  const ny = size.y > 1e-6 ? (y - min.y) / size.y : 0.5;
  const nz = size.z > 1e-6 ? (z - min.z) / size.z : 0.5;

  const scores = new Map<BoneName, number>();
  const add = (name: BoneName, w: number) => {
    if (w <= 0) return;
    scores.set(name, (scores.get(name) ?? 0) + w);
  };

  // 胴体コア
  add('hips', Math.exp(-Math.pow((ny - 0.48) * 4.2, 2)));
  add('spine', Math.exp(-Math.pow((ny - 0.58) * 4.5, 2)));
  add('chest', Math.exp(-Math.pow((ny - 0.70) * 4.8, 2)));
  add('neck', Math.exp(-Math.pow((ny - 0.84) * 8, 2)) * 0.9);
  add('head', Math.exp(-Math.pow((ny - 0.94) * 10, 2)) * (ny > 0.78 ? 1.4 : 0.2));

  // 脚
  const leftBias = Math.max(0, 1 - nx * 2);
  const rightBias = Math.max(0, nx * 2 - 1);
  if (ny < 0.52) {
    add('L_upperLeg', Math.exp(-Math.pow((ny - 0.38) * 5, 2)) * (0.55 + leftBias));
    add('L_lowerLeg', Math.exp(-Math.pow((ny - 0.2) * 6, 2)) * (0.55 + leftBias));
    add('L_foot', Math.exp(-Math.pow((ny - 0.05) * 10, 2)) * (0.45 + leftBias));
    add('R_upperLeg', Math.exp(-Math.pow((ny - 0.38) * 5, 2)) * (0.55 + rightBias));
    add('R_lowerLeg', Math.exp(-Math.pow((ny - 0.2) * 6, 2)) * (0.55 + rightBias));
    add('R_foot', Math.exp(-Math.pow((ny - 0.05) * 10, 2)) * (0.45 + rightBias));
  }

  // 腕
  const armBand = ny > 0.48 && ny < 0.9 ? 1 : 0.15;
  const outerL = Math.max(0, 0.42 - nx) * 3;
  const outerR = Math.max(0, nx - 0.58) * 3;
  add('L_upperArm', armBand * (0.3 + outerL) * Math.exp(-Math.pow((ny - 0.72) * 5, 2)));
  add('L_lowerArm', armBand * (0.3 + outerL) * Math.exp(-Math.pow((ny - 0.56) * 5, 2)));
  add('R_upperArm', armBand * (0.3 + outerR) * Math.exp(-Math.pow((ny - 0.72) * 5, 2)));
  add('R_lowerArm', armBand * (0.3 + outerR) * Math.exp(-Math.pow((ny - 0.56) * 5, 2)));

  // チキンは腕＝翼なので横方向をより強く
  if (style === 'avian') {
    add('L_upperArm', (1 - nx) * 1.2 * armBand);
    add('R_upperArm', nx * 1.2 * armBand);
  }

  // 前傾（ゾンビ腕）向けに胸〜腕の繋がりを強める
  if (style === 'zombie') {
    add('chest', 0.25);
    add('L_upperArm', 0.15 + outerL * 0.2);
    add('R_upperArm', 0.15 + outerR * 0.2);
  }

  // 前後方向: 足先は前寄り
  if (nz > 0.58 && ny < 0.2) {
    add('L_foot', 0.2 * leftBias);
    add('R_foot', 0.2 * rightBias);
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const [, w] of sorted) sum += w;
  if (sum < 1e-6) {
    const hips = boneIndex.hips;
    return { indices: [hips, 0, 0, 0], weights: [1, 0, 0, 0] };
  }

  const indices: [number, number, number, number] = [0, 0, 0, 0];
  const weights: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    if (i < sorted.length) {
      indices[i] = boneIndex[sorted[i][0]];
      weights[i] = sorted[i][1] / sum;
    }
  }
  // 正規化の数値誤差を補正
  const wsum = weights[0] + weights[1] + weights[2] + weights[3];
  if (wsum > 0) {
    weights[0] /= wsum;
    weights[1] /= wsum;
    weights[2] /= wsum;
    weights[3] /= wsum;
  }
  return { indices, weights };
}

function createBoneHierarchy(
  box: THREE.Box3,
  style: MobRigProfileId,
): { bones: THREE.Bone[]; boneMap: Record<BoneName, THREE.Bone>; rootBone: THREE.Bone } {
  const size = new THREE.Vector3();
  const min = box.min.clone();
  box.getSize(size);

  // チキンは少し脚長めに見せるため Y 配置を圧縮
  const yScale = style === 'avian' ? 0.92 : style === 'brute' ? 1.05 : 1;

  const boneMap = {} as Record<BoneName, THREE.Bone>;
  const bones: THREE.Bone[] = [];

  for (const def of HUMANOID_BONES) {
    const bone = new THREE.Bone();
    bone.name = def.name;
    const px = min.x + def.pos[0] * size.x;
    const py = min.y + def.pos[1] * size.y * yScale + (1 - yScale) * size.y * 0.04;
    const pz = min.z + def.pos[2] * size.z;
    bone.position.set(px, py, pz);
    boneMap[def.name] = bone;
    bones.push(bone);
  }

  // 親子付け（ローカル座標に変換）
  for (const def of HUMANOID_BONES) {
    if (!def.parent) continue;
    const parent = boneMap[def.parent];
    const child = boneMap[def.name];
    parent.add(child);
    // ワールド位置を維持したまま親子化
    const worldPos = child.position.clone();
    parent.worldToLocal(worldPos);
    child.position.copy(worldPos);
  }

  // ルートは hips をグループ原点付近に
  const rootBone = boneMap.hips;
  return { bones, boneMap, rootBone };
}

function convertMeshToSkinned(
  mesh: THREE.Mesh,
  boneIndex: Record<BoneName, number>,
  box: THREE.Box3,
  style: MobRigProfileId,
): THREE.SkinnedMesh {
  const geometry = mesh.geometry.clone();
  // ワールド座標へベイク（スケルトンと一致させる）
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);

  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = pos.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    const painted = paintVertexWeights(v.x, v.y, v.z, box, boneIndex, style);
    for (let k = 0; k < 4; k++) {
      skinIndices[i * 4 + k] = painted.indices[k];
      skinWeights[i * 4 + k] = painted.weights[k];
    }
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  const material = Array.isArray(mesh.material)
    ? mesh.material.map(cloneMaterial)
    : cloneMaterial(mesh.material);

  const skinned = new THREE.SkinnedMesh(geometry, material);
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  // bind は骨階層確定後に一括で行う
  return skinned;
}

/**
 * 静的シーンからプロシージャル・リグを構築する
 * 失敗時は null（呼び出し側は従来描画にフォールバック）
 */
export function buildProceduralMobRig(
  sourceScene: THREE.Object3D,
  style: MobRigProfileId,
): ProceduralMobRig | null {
  if (style === 'prototype_arachnid') {
    return buildPrototypeMultipartRig(sourceScene);
  }
  // コードネイティブのクモとボスは各Renderer側で専用リグを持つ。
  if (style === 'spider' || style === 'boss') return null;

  const rigidPartRig = buildRigidPartMobRig(sourceScene, style);
  if (rigidPartRig) return rigidPartRig;

  const meshes = findMeshes(sourceScene);
  if (meshes.length === 0) return null;

  // 頂点数でソート。マルチパーツ（プロトタイプ等）は全パーツをスキニングする
  meshes.sort((a, b) => {
    const ac = a.geometry.getAttribute('position')?.count ?? 0;
    const bc = b.geometry.getAttribute('position')?.count ?? 0;
    return bc - ac;
  });
  // darwin/brute: 最大32パーツ（手足が別メッシュでも動く）
  // zombie: 大きめ2メッシュ / avian: 1メッシュ
  const meshCap =
    style === 'darwin' || style === 'brute' ? 32
      : style === 'zombie' ? 4
        : 1;
  const targetMeshes = meshes.slice(0, meshCap);

  const box = combinedBox(targetMeshes);
  if (box.isEmpty()) return null;

  const { bones, boneMap, rootBone } = createBoneHierarchy(box, style);
  const skeleton = new THREE.Skeleton(bones);

  const boneIndex = {} as Record<BoneName, number>;
  BONE_NAMES.forEach((name, i) => {
    boneIndex[name] = i;
  });

  const root = new THREE.Group();
  root.name = 'proceduralMobRig';
  root.add(rootBone);

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  for (const mesh of targetMeshes) {
    try {
      const skinned = convertMeshToSkinned(mesh, boneIndex, box, style);
      root.add(skinned);
      skinnedMeshes.push(skinned);
    } catch {
      // 個別メッシュの失敗はスキップ
    }
  }

  if (skinnedMeshes.length === 0) {
    skeleton.pose();
    return null;
  }

  // バインドポーズを確定（親子付け後のワールド行列で inverse を取る）
  root.updateMatrixWorld(true);
  for (const skinned of skinnedMeshes) {
    skinned.bind(skeleton, new THREE.Matrix4());
    skinned.normalizeSkinWeights();
  }
  skeleton.calculateInverses();

  // レストポーズを保存
  const restLocal = new Map<BoneName, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
  for (const name of BONE_NAMES) {
    const b = boneMap[name];
    restLocal.set(name, {
      pos: b.position.clone(),
      quat: b.quaternion.clone(),
    });
  }

  const styleParams = getStyleParams(style);
  const rigProfile = MOB_RIG_PROFILES[style];
  const locomotionPhase = createLocomotionPhaseState();
  const bodyHeight = Math.max(0.01, box.max.y - box.min.y);
  const scratchEuler = new THREE.Euler();
  const scratchQuat = new THREE.Quaternion();

  const setBoneEuler = (name: BoneName, x: number, y: number, z: number) => {
    const bone = boneMap[name];
    const rest = restLocal.get(name);
    if (!bone || !rest) return;
    scratchEuler.set(x, y, z, 'XYZ');
    scratchQuat.setFromEuler(scratchEuler);
    bone.quaternion.copy(rest.quat).multiply(scratchQuat);
  };

  const update = (state: MobRigAnimState) => {
    const p = styleParams;
    const attackTimer = state.attackTimer ?? 0;
    const attackDuration = Math.max(0.2, state.attackDuration ?? 0.52);
    const attacking = attackTimer > 0.01;
    const attackProgress = attacking
      ? THREE.MathUtils.clamp(1 - attackTimer / attackDuration, 0, 1)
      : 0;
    // 攻撃中は歩行をほぼ止める
    const moving = !attacking && state.moving && state.speed > 0.05;
    const speedNorm = THREE.MathUtils.clamp(state.speed / 3.2, 0.35, 1.45);
    const previousPhase = locomotionPhase.phase;
    const basePhase = advanceLocomotionPhase(locomotionPhase, {
      speed: state.speed,
      delta: state.delta ?? 1 / 60,
      rotation: state.rotation ?? 0,
      moving,
      profile: rigProfile,
    });
    const steppedInPlace = Math.abs(basePhase - previousPhase) > 0.00001;
    const stepping = moving || steppedInPlace;
    const t = basePhase * Math.PI * 2;
    const hit = THREE.MathUtils.clamp(state.hitTimer / 0.24, 0, 1);
    const angry = state.angry ? 1 : 0;
    const allyBoost = state.ally ? 1.12 : 1;
    const amp = (stepping ? 1 : 0.08) * p.walkAmp * (0.85 + speedNorm * 0.22) * allyBoost;

    // リセット
    for (const name of BONE_NAMES) {
      const bone = boneMap[name];
      const rest = restLocal.get(name);
      if (!bone || !rest) continue;
      bone.position.copy(rest.pos);
      bone.quaternion.copy(rest.quat);
    }

    // --- アイドル呼吸 ---
    const breath = Math.sin(state.time * 2.1) * p.idleAmp * (moving ? 0.3 : attacking ? 0.15 : 1);
    setBoneEuler('spine', breath * 0.4, 0, 0);
    setBoneEuler('chest', breath * 0.6 + angry * 0.05, 0, 0);
    setBoneEuler(
      'head',
      Math.sin(state.time * 1.3) * p.idleAmp * 0.8,
      Math.sin(state.time * 0.7) * p.idleAmp * 1.2,
      0,
    );

    // --- 歩行（脚・膝・足・骨盤・腕・胴の連動） ---
    const gaitL = sampleGait(basePhase, 0, rigProfile);
    const gaitR = sampleGait(basePhase, 0.5, rigProfile);
    const idleLeg = Math.sin(state.time * rigProfile.idleFrequency) * p.walkAmp * 0.025;
    const legSwing = stepping ? gaitL.stride * amp : idleLeg;
    const legSwingR = stepping ? gaitR.stride * amp : -idleLeg;
    const kneeL = stepping
      ? gaitL.lift * p.kneeAmp + (1 - gaitL.plantedWeight) * p.kneeAmp * 0.08
      : p.kneeAmp * 0.04;
    const kneeR = stepping
      ? gaitR.lift * p.kneeAmp + (1 - gaitR.plantedWeight) * p.kneeAmp * 0.08
      : p.kneeAmp * 0.04;
    const strideLean = moving ? Math.min(0.14, state.speed * 0.035) : 0;

    setBoneEuler('L_upperLeg', legSwing + strideLean * 0.15, 0, 0.045);
    setBoneEuler('R_upperLeg', legSwingR + strideLean * 0.15, 0, -0.045);
    setBoneEuler('L_lowerLeg', kneeL, 0, 0);
    setBoneEuler('R_lowerLeg', kneeR, 0, 0);
    setBoneEuler(
      'L_foot',
      -kneeL * 0.5 - Math.max(0, legSwing) * 0.28 + Math.max(0, -legSwing) * 0.12,
      0,
      0,
    );
    setBoneEuler(
      'R_foot',
      -kneeR * 0.5 - Math.max(0, legSwingR) * 0.28 + Math.max(0, -legSwingR) * 0.12,
      0,
      0,
    );
    boneMap.L_foot.position.y += state.leftFootGroundOffset ?? 0;
    boneMap.R_foot.position.y += state.rightFootGroundOffset ?? 0;

    const hipBob = stepping
      ? Math.abs(Math.sin(t * 2)) * rigProfile.bodyBob * p.heavy
      : breath * 0.02;
    boneMap.hips.position.y += hipBob * bodyHeight * 0.09;
    boneMap.hips.position.y += (
      (state.leftFootGroundOffset ?? 0)
      + (state.rightFootGroundOffset ?? 0)
    ) * 0.18;
    if (moving) {
      boneMap.hips.position.z += Math.sin(t * 2) * bodyHeight * 0.004 * p.heavy;
    }
    setBoneEuler(
      'hips',
      strideLean * 0.35,
      Math.sin(t) * amp * 0.16,
      Math.sin(t) * amp * 0.11,
    );
    setBoneEuler(
      'spine',
      breath * 0.4 + Math.sin(t) * amp * 0.1 + strideLean * 0.5,
      Math.sin(t) * amp * 0.14,
      Math.sin(t * 0.5) * amp * 0.04,
    );
    setBoneEuler(
      'chest',
      breath * 0.55 + strideLean * 0.25 + angry * 0.05,
      -Math.sin(t) * amp * 0.08,
      0,
    );

    // 腕
    if (style === 'zombie') {
      const zArm = p.armForward + Math.sin(t) * p.armAmp * 0.35;
      setBoneEuler('L_upperArm', -zArm, 0.15, 0.35 + Math.sin(t + 0.4) * 0.08);
      setBoneEuler('R_upperArm', -zArm, -0.15, -0.35 + Math.sin(t + 0.4 + Math.PI) * 0.08);
      setBoneEuler('L_lowerArm', -0.35 - Math.sin(t) * 0.1, 0, 0.1);
      setBoneEuler('R_lowerArm', -0.35 - Math.sin(t + Math.PI) * 0.1, 0, -0.1);
    } else if (style === 'avian') {
      const flap = moving ? Math.sin(t * 1.6) * p.armAmp : Math.sin(state.time * 3) * 0.25;
      setBoneEuler('L_upperArm', 0.2, 0, 0.9 + flap);
      setBoneEuler('R_upperArm', 0.2, 0, -0.9 - flap);
      setBoneEuler('L_lowerArm', 0.4 + flap * 0.3, 0, 0.2);
      setBoneEuler('R_lowerArm', 0.4 + flap * 0.3, 0, -0.2);
      setBoneEuler('head', Math.sin(t * 2) * 0.25, Math.sin(state.time * 2.5) * 0.15, 0);
    } else {
      const armL = -legSwingR * p.armAmp * 1.85;
      const armR = -legSwing * p.armAmp * 1.85;
      const shoulderOpen = 0.18 + angry * 0.12;
      setBoneEuler('L_upperArm', armL, 0.06, shoulderOpen);
      setBoneEuler('R_upperArm', armR, -0.06, -shoulderOpen);
      setBoneEuler('L_lowerArm', Math.max(0.12, -armL * 0.55 + 0.15), 0, 0.06);
      setBoneEuler('R_lowerArm', Math.max(0.12, -armR * 0.55 + 0.15), 0, -0.06);
    }

    // --- 攻撃モーション（右腕スイング中心、全身連動） ---
    if (attacking) {
      const atk = attackPose(attackProgress);
      const power = state.ally ? 1.15 : style === 'brute' ? 1.25 : 1;

      setBoneEuler('hips', atk.torsoPitch * 0.35 * power, atk.hipTwist * power, atk.torsoYaw * 0.4);
      boneMap.hips.position.z += atk.lunge * bodyHeight * 0.35;
      boneMap.hips.position.y += Math.abs(atk.lunge) * bodyHeight * 0.04;

      setBoneEuler(
        'spine',
        atk.torsoPitch * 0.55 * power,
        atk.torsoYaw * 0.65 * power,
        atk.hipTwist * 0.3,
      );
      setBoneEuler(
        'chest',
        atk.torsoPitch * 0.7 * power,
        atk.torsoYaw * power,
        -atk.armSwing * 0.08,
      );
      setBoneEuler('neck', atk.headPitch * 0.4, atk.torsoYaw * 0.2, 0);
      setBoneEuler('head', atk.headPitch, atk.torsoYaw * 0.35, 0);

      setBoneEuler(
        'R_upperArm',
        -atk.armSwing * 1.05 * power - atk.armRaise * 0.15,
        -0.35 - atk.armSwing * 0.25,
        -0.55 - atk.armRaise * 0.85 * power,
      );
      setBoneEuler(
        'R_lowerArm',
        atk.elbow * 1.1 + Math.max(0, -atk.armSwing) * 0.4,
        0.1,
        -0.15,
      );

      setBoneEuler(
        'L_upperArm',
        -0.35 - atk.torsoPitch * 0.4,
        0.25,
        0.55 + atk.armRaise * 0.2,
      );
      setBoneEuler('L_lowerArm', 0.7 + atk.elbow * 0.2, 0, 0.15);

      setBoneEuler('R_upperLeg', -atk.lunge * 2.2, 0.05, -0.04);
      setBoneEuler('L_upperLeg', atk.lunge * 1.4, -0.04, 0.05);
      setBoneEuler('R_lowerLeg', Math.max(0.05, atk.lunge * 1.5), 0, 0);
      setBoneEuler('L_lowerLeg', Math.max(0.08, -atk.lunge * 0.8 + 0.15), 0, 0);
    }

    // 怒り: 肩を上げて前傾
    if (angry > 0 && !attacking) {
      setBoneEuler('chest', 0.12, 0, 0);
      setBoneEuler('head', -0.08, Math.sin(state.time * 6) * 0.08, 0);
    }

    // 被ダメリアクション（攻撃中は弱め）— 多部位ひるみ + ヒット方向ロール
    if (hit > 0.01) {
      // 序盤ほど強く、残時間で減衰（二乗より立方でピークを尖らせる）
      const flinch = hit * hit * (0.55 + hit * 0.45) * (attacking ? 0.4 : 1.15);
      const shake = Math.sin(state.time * 52) * hit;
      const shake2 = Math.cos(state.time * 41) * hit;
      // ローカルひるみ向き（モデル前方基準でヒット方向をざっくり反映）
      const hdx = state.hitDirX ?? 0;
      const hdz = state.hitDirZ ?? 0;
      const localYaw = Math.atan2(hdx, hdz) - 0; // ルートが既に回転しているため相対は弱め
      const sideRoll = THREE.MathUtils.clamp(hdx * 0.35 + shake * 0.12, -0.45, 0.45);

      setBoneEuler(
        'hips',
        -0.18 * flinch,
        sideRoll * 0.35 + shake * 0.06,
        sideRoll * 0.55,
      );
      boneMap.hips.position.y -= flinch * bodyHeight * 0.035;
      boneMap.hips.position.z -= flinch * bodyHeight * 0.04;

      setBoneEuler(
        'spine',
        -0.55 * flinch + shake * 0.08,
        sideRoll * 0.4 + shake * 0.1,
        sideRoll * 0.25,
      );
      setBoneEuler(
        'chest',
        -0.42 * flinch,
        sideRoll * 0.55 + shake2 * 0.08,
        sideRoll * 0.35 + shake * 0.06,
      );
      setBoneEuler(
        'neck',
        0.25 * flinch,
        sideRoll * 0.3 + shake * 0.12,
        0,
      );
      setBoneEuler(
        'head',
        0.55 * flinch + shake * 0.15,
        sideRoll * 0.5 + Math.sin(state.time * 36) * 0.22 * hit,
        shake2 * 0.12,
      );

      if (!attacking) {
        // 腕を顔の前へガード気味に
        setBoneEuler('L_upperArm', -0.75 * flinch, 0.2, 0.55 * flinch + 0.15);
        setBoneEuler('R_upperArm', -0.75 * flinch, -0.2, -0.55 * flinch - 0.15);
        setBoneEuler('L_lowerArm', 0.9 * flinch + 0.2, 0, 0.1);
        setBoneEuler('R_lowerArm', 0.9 * flinch + 0.2, 0, -0.1);
        // 脚を少し開いて踏ん張る
        setBoneEuler('L_upperLeg', 0.2 * flinch, 0, 0.12 * flinch);
        setBoneEuler('R_upperLeg', 0.2 * flinch, 0, -0.12 * flinch);
        setBoneEuler('L_lowerLeg', 0.25 * flinch, 0, 0);
        setBoneEuler('R_lowerLeg', 0.25 * flinch, 0, 0);
      }
      void localYaw;
    }

    root.updateMatrixWorld(true);
    for (const skinned of skinnedMeshes) {
      skinned.skeleton.update();
    }
  };

  const traverseMaterials = (fn: (mat: THREE.Material) => void) => {
    for (const skinned of skinnedMeshes) {
      const mats = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
      mats.forEach(fn);
    }
  };

  const dispose = () => {
    for (const skinned of skinnedMeshes) {
      skinned.geometry.dispose();
      const mats = Array.isArray(skinned.material) ? skinned.material : [skinned.material];
      mats.forEach((m) => m.dispose());
    }
  };

  // 初期ポーズ
  update({
    time: 0,
    moving: false,
    speed: 0,
    hitTimer: 0,
    angry: false,
  });

  return { root, update, traverseMaterials, dispose };
}
