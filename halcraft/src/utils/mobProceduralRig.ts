// 静的GLB（骨なし）から人型スケルトンを自動生成し、
// 歩行・待機・被ダメなどのプロシージャルアニメを駆動する

import * as THREE from 'three';

/** リグの体型プリセット */
export type MobRigStyle = 'zombie' | 'humanoid' | 'brute' | 'chicken';

/** アニメーション入力 */
export interface MobRigAnimState {
  /** 経過時間（秒） */
  time: number;
  /** 移動中か */
  moving: boolean;
  /** 水平速度（ブロック/秒） */
  speed: number;
  /** 被ダメ残り時間（秒） */
  hitTimer: number;
  /** 怒り状態 */
  angry: boolean;
  /** 味方か（アニメのトーンを少し変える） */
  ally?: boolean;
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

function getStyleParams(style: MobRigStyle): StyleParams {
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
    case 'chicken':
      return {
        walkAmp: 0.7,
        armAmp: 0.9,
        idleAmp: 0.08,
        kneeAmp: 0.75,
        armForward: 0.1,
        walkFreq: 9.5,
        heavy: 0.55,
      };
    case 'humanoid':
    default:
      return {
        walkAmp: 0.5,
        armAmp: 0.48,
        idleAmp: 0.045,
        kneeAmp: 0.5,
        armForward: 0.12,
        walkFreq: 5.8,
        heavy: 1,
      };
  }
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
  style: MobRigStyle,
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
  if (style === 'chicken') {
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
  style: MobRigStyle,
): { bones: THREE.Bone[]; boneMap: Record<BoneName, THREE.Bone>; rootBone: THREE.Bone } {
  const size = new THREE.Vector3();
  const min = box.min.clone();
  box.getSize(size);

  // チキンは少し脚長めに見せるため Y 配置を圧縮
  const yScale = style === 'chicken' ? 0.92 : style === 'brute' ? 1.05 : 1;

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
  style: MobRigStyle,
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
  style: MobRigStyle,
): ProceduralMobRig | null {
  const meshes = findMeshes(sourceScene);
  if (meshes.length === 0) return null;

  // 巨大メッシュはパフォーマンスのため最大1メッシュに絞る（darwin 等）
  meshes.sort((a, b) => {
    const ac = a.geometry.getAttribute('position')?.count ?? 0;
    const bc = b.geometry.getAttribute('position')?.count ?? 0;
    return bc - ac;
  });
  const targetMeshes = meshes.slice(0, style === 'brute' || style === 'zombie' || style === 'humanoid' ? 2 : 1);

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
    const moving = state.moving && state.speed > 0.05;
    const speedNorm = THREE.MathUtils.clamp(state.speed / 3.2, 0.35, 1.35);
    const freq = p.walkFreq * (moving ? speedNorm : 0.35);
    const t = state.time * freq;
    const hit = THREE.MathUtils.clamp(state.hitTimer / 0.24, 0, 1);
    const angry = state.angry ? 1 : 0;
    const amp = (moving ? 1 : 0.22) * p.walkAmp * (0.85 + speedNorm * 0.2);

    // リセット
    for (const name of BONE_NAMES) {
      const bone = boneMap[name];
      const rest = restLocal.get(name);
      if (!bone || !rest) continue;
      bone.position.copy(rest.pos);
      bone.quaternion.copy(rest.quat);
    }

    // --- アイドル呼吸 ---
    const breath = Math.sin(state.time * 2.1) * p.idleAmp * (moving ? 0.35 : 1);
    setBoneEuler('spine', breath * 0.4, 0, 0);
    setBoneEuler('chest', breath * 0.6 + angry * 0.05, 0, 0);
    setBoneEuler('head', Math.sin(state.time * 1.3) * p.idleAmp * 0.8, Math.sin(state.time * 0.7) * p.idleAmp * 1.2, 0);

    // --- 歩行 ---
    const legSwing = Math.sin(t) * amp;
    const legSwingR = Math.sin(t + Math.PI) * amp;
    const kneeL = Math.max(0, -Math.sin(t)) * p.kneeAmp * (moving ? 1 : 0.15);
    const kneeR = Math.max(0, -Math.sin(t + Math.PI)) * p.kneeAmp * (moving ? 1 : 0.15);

    setBoneEuler('L_upperLeg', legSwing, 0, 0.04);
    setBoneEuler('R_upperLeg', legSwingR, 0, -0.04);
    setBoneEuler('L_lowerLeg', kneeL, 0, 0);
    setBoneEuler('R_lowerLeg', kneeR, 0, 0);
    setBoneEuler('L_foot', -kneeL * 0.45 - Math.max(0, legSwing) * 0.2, 0, 0);
    setBoneEuler('R_foot', -kneeR * 0.45 - Math.max(0, legSwingR) * 0.2, 0, 0);

    // 骨盤の上下・ねじり
    const hipBob = moving ? Math.abs(Math.sin(t * 2)) * 0.035 * p.heavy : breath * 0.02;
    boneMap.hips.position.y += hipBob * bodyHeight * 0.08;
    setBoneEuler('hips', 0, Math.sin(t) * amp * 0.12, Math.sin(t) * amp * 0.08);
    setBoneEuler('spine', breath * 0.4 + Math.sin(t) * amp * 0.08, Math.sin(t) * amp * 0.1, 0);

    // 腕
    if (style === 'zombie') {
      // 前に突き出した腕 + わずかな揺れ
      const zArm = p.armForward + Math.sin(t) * p.armAmp * 0.35;
      setBoneEuler('L_upperArm', -zArm, 0.15, 0.35 + Math.sin(t + 0.4) * 0.08);
      setBoneEuler('R_upperArm', -zArm, -0.15, -0.35 + Math.sin(t + 0.4 + Math.PI) * 0.08);
      setBoneEuler('L_lowerArm', -0.35 - Math.sin(t) * 0.1, 0, 0.1);
      setBoneEuler('R_lowerArm', -0.35 - Math.sin(t + Math.PI) * 0.1, 0, -0.1);
    } else if (style === 'chicken') {
      // 羽ばたき
      const flap = moving ? Math.sin(t * 1.6) * p.armAmp : Math.sin(state.time * 3) * 0.25;
      setBoneEuler('L_upperArm', 0.2, 0, 0.9 + flap);
      setBoneEuler('R_upperArm', 0.2, 0, -0.9 - flap);
      setBoneEuler('L_lowerArm', 0.4 + flap * 0.3, 0, 0.2);
      setBoneEuler('R_lowerArm', 0.4 + flap * 0.3, 0, -0.2);
      // 頭のコツコツ
      setBoneEuler('head', Math.sin(t * 2) * 0.25, Math.sin(state.time * 2.5) * 0.15, 0);
    } else {
      // 通常の腕振り（脚と逆相）
      const armL = -legSwingR * p.armAmp * 1.6;
      const armR = -legSwing * p.armAmp * 1.6;
      setBoneEuler('L_upperArm', armL, 0.05, 0.2 + angry * 0.15);
      setBoneEuler('R_upperArm', armR, -0.05, -0.2 - angry * 0.15);
      setBoneEuler('L_lowerArm', Math.max(0.1, -armL * 0.5), 0, 0.05);
      setBoneEuler('R_lowerArm', Math.max(0.1, -armR * 0.5), 0, -0.05);
    }

    // 怒り: 肩を上げて前傾
    if (angry > 0) {
      setBoneEuler('chest', 0.12, 0, 0);
      setBoneEuler('head', -0.08, Math.sin(state.time * 6) * 0.08, 0);
    }

    // 被ダメリアクション
    if (hit > 0.01) {
      const flinch = hit * hit;
      setBoneEuler('spine', -0.35 * flinch, Math.sin(state.time * 40) * 0.12 * hit, 0);
      setBoneEuler('chest', -0.25 * flinch, 0, Math.sin(state.time * 38) * 0.1 * hit);
      setBoneEuler('head', 0.4 * flinch, Math.sin(state.time * 30) * 0.2 * hit, 0);
      setBoneEuler('L_upperArm', -0.5 * flinch, 0, 0.4 * flinch);
      setBoneEuler('R_upperArm', -0.5 * flinch, 0, -0.4 * flinch);
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
