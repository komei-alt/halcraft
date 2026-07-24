// 骨を持たないマルチパーツGLB向けの剛体リグ。
// 全メッシュを必ず保持し、部品単位で関節へ割り当てることで、
// 巨大メッシュへの自動ウェイト塗りによる溶け・欠落・初期化負荷を避ける。

import * as THREE from 'three';
import type { MobRigAnimState, ProceduralMobRig } from './mobProceduralRig';
import {
  MOB_RIG_PROFILES,
  advanceLocomotionPhase,
  createLocomotionPhaseState,
  sampleGait,
  type MobRigProfileId,
} from './mobRigMotion';

type RigidRigProfileId = Extract<MobRigProfileId, 'zombie' | 'darwin' | 'avian' | 'brute'>;

const JOINT_NAMES = [
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

type JointName = (typeof JOINT_NAMES)[number];

interface JointDefinition {
  name: JointName;
  parent: JointName | null;
  position: readonly [number, number, number];
}

const JOINT_DEFINITIONS: readonly JointDefinition[] = [
  { name: 'hips', parent: null, position: [0.5, 0.46, 0.5] },
  { name: 'spine', parent: 'hips', position: [0.5, 0.57, 0.5] },
  { name: 'chest', parent: 'spine', position: [0.5, 0.69, 0.5] },
  { name: 'neck', parent: 'chest', position: [0.5, 0.82, 0.5] },
  { name: 'head', parent: 'neck', position: [0.5, 0.9, 0.5] },
  { name: 'L_upperLeg', parent: 'hips', position: [0.39, 0.42, 0.5] },
  { name: 'L_lowerLeg', parent: 'L_upperLeg', position: [0.39, 0.24, 0.5] },
  { name: 'L_foot', parent: 'L_lowerLeg', position: [0.39, 0.07, 0.55] },
  { name: 'R_upperLeg', parent: 'hips', position: [0.61, 0.42, 0.5] },
  { name: 'R_lowerLeg', parent: 'R_upperLeg', position: [0.61, 0.24, 0.5] },
  { name: 'R_foot', parent: 'R_lowerLeg', position: [0.61, 0.07, 0.55] },
  { name: 'L_upperArm', parent: 'chest', position: [0.28, 0.72, 0.5] },
  { name: 'L_lowerArm', parent: 'L_upperArm', position: [0.17, 0.58, 0.5] },
  { name: 'R_upperArm', parent: 'chest', position: [0.72, 0.72, 0.5] },
  { name: 'R_lowerArm', parent: 'R_upperArm', position: [0.83, 0.58, 0.5] },
];

interface SourceRigidPart {
  source: THREE.Mesh;
  worldMatrix: THREE.Matrix4;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

interface RigidStyleTuning {
  legSwing: number;
  knee: number;
  armSwing: number;
  bodyLean: number;
  shoulderOpen: number;
  idle: number;
}

const STYLE_TUNING: Readonly<Record<RigidRigProfileId, RigidStyleTuning>> = {
  zombie: {
    legSwing: 0.5,
    knee: 0.48,
    armSwing: 0.2,
    bodyLean: 0.12,
    shoulderOpen: 0.34,
    idle: 0.035,
  },
  darwin: {
    legSwing: 0.58,
    knee: 0.56,
    armSwing: 0.72,
    bodyLean: 0.08,
    shoulderOpen: 0.18,
    idle: 0.045,
  },
  avian: {
    legSwing: 0.68,
    knee: 0.72,
    armSwing: 0.9,
    bodyLean: 0.04,
    shoulderOpen: 0.72,
    idle: 0.065,
  },
  brute: {
    legSwing: 0.34,
    knee: 0.38,
    armSwing: 0.34,
    bodyLean: 0.1,
    shoulderOpen: 0.24,
    idle: 0.025,
  },
};

function cloneMaterial(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  clone.depthTest = true;
  clone.depthWrite = true;
  return clone;
}

function collectParts(source: THREE.Object3D): SourceRigidPart[] {
  source.updateMatrixWorld(true);
  const parts: SourceRigidPart[] = [];
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const worldMatrix = child.matrixWorld.clone();
    const box = child.geometry.boundingBox!.clone().applyMatrix4(worldMatrix);
    parts.push({
      source: child,
      worldMatrix,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
    });
  });
  return parts;
}

function getCombinedBox(parts: readonly SourceRigidPart[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const part of parts) {
    const half = part.size.clone().multiplyScalar(0.5);
    box.expandByPoint(part.center.clone().sub(half));
    box.expandByPoint(part.center.clone().add(half));
  }
  return box;
}

function normalizedCenter(part: SourceRigidPart, box: THREE.Box3): THREE.Vector3 {
  const size = box.getSize(new THREE.Vector3());
  return new THREE.Vector3(
    size.x > 1e-6 ? (part.center.x - box.min.x) / size.x : 0.5,
    size.y > 1e-6 ? (part.center.y - box.min.y) / size.y : 0.5,
    size.z > 1e-6 ? (part.center.z - box.min.z) / size.z : 0.5,
  );
}

function classifyPart(part: SourceRigidPart, box: THREE.Box3, profile: RigidRigProfileId): JointName {
  const n = normalizedCenter(part, box);
  const side: 'L' | 'R' = n.x < 0.5 ? 'L' : 'R';
  const outer = Math.abs(n.x - 0.5);
  const fullSize = box.getSize(new THREE.Vector3());
  const relativeWidth = fullSize.x > 1e-6 ? part.size.x / fullSize.x : 1;
  const relativeHeight = fullSize.y > 1e-6 ? part.size.y / fullSize.y : 1;

  if (profile === 'avian') {
    if (n.y > 0.72) return n.y > 0.82 ? 'head' : 'neck';
    if (n.y < 0.34 && outer > 0.035) {
      if (n.y < 0.13) return `${side}_foot`;
      if (n.y < 0.23) return `${side}_lowerLeg`;
      return `${side}_upperLeg`;
    }
    if (outer > 0.19 && n.y > 0.34) {
      return outer > 0.31 ? `${side}_lowerArm` : `${side}_upperArm`;
    }
    return n.y > 0.54 ? 'chest' : n.y > 0.43 ? 'spine' : 'hips';
  }

  // 全身を覆う大きな一枚メッシュは胴へ残し、細い独立部品だけを四肢にする。
  const limbCandidate = relativeWidth < 0.58 || outer > 0.16;
  if (n.y < 0.5 && limbCandidate) {
    if (n.y < 0.14) return `${side}_foot`;
    if (n.y < 0.3) return `${side}_lowerLeg`;
    return `${side}_upperLeg`;
  }
  if (n.y > 0.8) return n.y > 0.88 ? 'head' : 'neck';
  if (n.y > 0.46 && n.y < 0.82 && outer > 0.2 && relativeHeight < 0.62) {
    return outer > 0.34 || n.y < 0.61 ? `${side}_lowerArm` : `${side}_upperArm`;
  }
  if (n.y > 0.62) return 'chest';
  if (n.y > 0.51) return 'spine';
  return 'hips';
}

function createJoints(box: THREE.Box3, profile: RigidRigProfileId): Record<JointName, THREE.Group> {
  const size = box.getSize(new THREE.Vector3());
  const map = {} as Record<JointName, THREE.Group>;
  const yScale = profile === 'avian' ? 0.9 : profile === 'brute' ? 1.03 : 1;
  for (const definition of JOINT_DEFINITIONS) {
    const joint = new THREE.Group();
    joint.name = `rig_${definition.name}`;
    joint.position.set(
      box.min.x + definition.position[0] * size.x,
      box.min.y + definition.position[1] * size.y * yScale + (1 - yScale) * size.y * 0.05,
      box.min.z + definition.position[2] * size.z,
    );
    map[definition.name] = joint;
  }
  for (const definition of JOINT_DEFINITIONS) {
    if (!definition.parent) continue;
    const child = map[definition.name];
    const worldPosition = child.position.clone();
    const parent = map[definition.parent];
    parent.add(child);
    parent.worldToLocal(worldPosition);
    child.position.copy(worldPosition);
  }
  return map;
}

function attachPreservingWorld(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  worldMatrix: THREE.Matrix4,
  inverse: THREE.Matrix4,
  local: THREE.Matrix4,
): void {
  parent.updateWorldMatrix(true, false);
  inverse.copy(parent.matrixWorld).invert();
  local.multiplyMatrices(inverse, worldMatrix);
  local.decompose(object.position, object.quaternion, object.scale);
  parent.add(object);
}

function attackPose(progress: number): {
  torso: number;
  yaw: number;
  arm: number;
  elbow: number;
  lunge: number;
} {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p < 0.3) {
    const u = p / 0.3;
    return { torso: -0.16 * u, yaw: -0.18 * u, arm: -0.9 * u, elbow: 0.55 * u, lunge: -0.04 * u };
  }
  if (p < 0.52) {
    const u = (p - 0.3) / 0.22;
    return {
      torso: THREE.MathUtils.lerp(-0.16, 0.3, u),
      yaw: THREE.MathUtils.lerp(-0.18, 0.24, u),
      arm: THREE.MathUtils.lerp(-0.9, 1.15, u),
      elbow: THREE.MathUtils.lerp(0.55, 0.14, u),
      lunge: THREE.MathUtils.lerp(-0.04, 0.12, u),
    };
  }
  const u = (p - 0.52) / 0.48;
  return {
    torso: THREE.MathUtils.lerp(0.3, 0, u),
    yaw: THREE.MathUtils.lerp(0.24, 0, u),
    arm: THREE.MathUtils.lerp(1.15, 0, u),
    elbow: THREE.MathUtils.lerp(0.14, 0.18, u),
    lunge: THREE.MathUtils.lerp(0.12, 0, u),
  };
}

export function buildRigidPartMobRig(
  source: THREE.Object3D,
  profile: RigidRigProfileId,
): ProceduralMobRig | null {
  const sourceParts = collectParts(source);
  if (sourceParts.length === 0) return null;
  const box = getCombinedBox(sourceParts);
  if (box.isEmpty()) return null;

  const joints = createJoints(box, profile);
  const root = new THREE.Group();
  root.name = `${profile}RigidPartRig`;
  root.add(joints.hips);
  root.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  const inverse = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  for (const part of sourceParts) {
    const material = Array.isArray(part.source.material)
      ? part.source.material.map(cloneMaterial)
      : cloneMaterial(part.source.material);
    const clone = new THREE.Mesh(part.source.geometry, material);
    clone.name = part.source.name;
    clone.castShadow = true;
    clone.receiveShadow = true;
    clone.frustumCulled = false;
    attachPreservingWorld(clone, joints[classifyPart(part, box, profile)], part.worldMatrix, inverse, local);
    meshes.push(clone);
  }

  const rest = new Map<JointName, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();
  for (const name of JOINT_NAMES) {
    rest.set(name, {
      position: joints[name].position.clone(),
      quaternion: joints[name].quaternion.clone(),
    });
  }
  const tuning = STYLE_TUNING[profile];
  const gaitProfile = MOB_RIG_PROFILES[profile];
  const phaseState = createLocomotionPhaseState();
  let lodFrame = 0;
  let accumulatedDelta = 0;
  const euler = new THREE.Euler();
  const rotation = new THREE.Quaternion();
  const bodyHeight = Math.max(0.001, box.max.y - box.min.y);

  const setJoint = (name: JointName, x: number, y: number, z: number): void => {
    const base = rest.get(name);
    if (!base) return;
    euler.set(x, y, z, 'XYZ');
    rotation.setFromEuler(euler);
    joints[name].quaternion.copy(base.quaternion).multiply(rotation);
  };

  const update = (state: MobRigAnimState): void => {
    accumulatedDelta += Math.min(state.delta ?? 1 / 60, 0.05);
    lodFrame++;
    if (state.lod === 2 && lodFrame % 2 !== 0) return;
    const animationDelta = Math.min(accumulatedDelta, 0.08);
    accumulatedDelta = 0;
    for (const name of JOINT_NAMES) {
      const base = rest.get(name)!;
      joints[name].position.copy(base.position);
      joints[name].quaternion.copy(base.quaternion);
    }

    const attacking = (state.attackTimer ?? 0) > 0.01;
    const moving = state.moving && state.speed > 0.05 && !attacking;
    const phase = advanceLocomotionPhase(phaseState, {
      speed: state.speed,
      delta: animationDelta,
      rotation: state.rotation ?? 0,
      moving,
      profile: gaitProfile,
    });
    const left = sampleGait(phase, 0, gaitProfile);
    const right = sampleGait(phase, 0.5, gaitProfile);
    const speedNorm = THREE.MathUtils.clamp(state.speed / 3, 0.35, 1.35);
    const amplitude = moving ? speedNorm : 0;
    const leftSwing = left.stride * tuning.legSwing * amplitude;
    const rightSwing = right.stride * tuning.legSwing * amplitude;
    const leftKnee = (left.lift * tuning.knee + (1 - left.plantedWeight) * 0.06) * amplitude;
    const rightKnee = (right.lift * tuning.knee + (1 - right.plantedWeight) * 0.06) * amplitude;
    const cycle = phase * Math.PI * 2;
    const breath = Math.sin(state.time * gaitProfile.idleFrequency) * tuning.idle;

    setJoint('L_upperLeg', leftSwing, 0, 0.025);
    setJoint('R_upperLeg', rightSwing, 0, -0.025);
    setJoint('L_lowerLeg', leftKnee, 0, 0);
    setJoint('R_lowerLeg', rightKnee, 0, 0);
    setJoint('L_foot', -leftKnee * 0.55 - leftSwing * 0.14, 0, 0);
    setJoint('R_foot', -rightKnee * 0.55 - rightSwing * 0.14, 0, 0);
    joints.L_foot.position.y += state.leftFootGroundOffset ?? 0;
    joints.R_foot.position.y += state.rightFootGroundOffset ?? 0;

    const groundAverage = ((state.leftFootGroundOffset ?? 0) + (state.rightFootGroundOffset ?? 0)) * 0.5;
    joints.hips.position.y += groundAverage * 0.2;
    joints.hips.position.y += moving
      ? Math.abs(Math.sin(cycle)) * gaitProfile.bodyBob * bodyHeight * 0.045
      : breath * bodyHeight * 0.01;
    setJoint(
      'hips',
      moving ? tuning.bodyLean * Math.min(1, speedNorm) : 0,
      moving ? Math.sin(cycle) * 0.045 : 0,
      moving ? Math.sin(cycle) * gaitProfile.bodyRoll : 0,
    );
    setJoint('spine', breath * 0.45 + (moving ? leftSwing * 0.08 : 0), moving ? -Math.sin(cycle) * 0.05 : 0, 0);
    setJoint('chest', breath * 0.7 + (moving ? tuning.bodyLean * 0.35 : 0), moving ? Math.sin(cycle) * 0.04 : 0, 0);

    if (profile === 'zombie') {
      setJoint('L_upperArm', -1.05 - rightSwing * 0.15, 0.1, tuning.shoulderOpen);
      setJoint('R_upperArm', -1.05 - leftSwing * 0.15, -0.1, -tuning.shoulderOpen);
      setJoint('L_lowerArm', -0.28, 0, 0.08);
      setJoint('R_lowerArm', -0.28, 0, -0.08);
    } else if (profile === 'avian') {
      const flap = moving ? Math.sin(cycle * 1.6) * tuning.armSwing : Math.sin(state.time * 2.8) * 0.16;
      setJoint('L_upperArm', 0.12, 0, tuning.shoulderOpen + flap);
      setJoint('R_upperArm', 0.12, 0, -tuning.shoulderOpen - flap);
      setJoint('L_lowerArm', 0.22 + Math.abs(flap) * 0.22, 0, 0.12);
      setJoint('R_lowerArm', 0.22 + Math.abs(flap) * 0.22, 0, -0.12);
      // ニワトリは歩行中も視線を安定させる。
      setJoint('neck', -leftSwing * 0.12, -Math.sin(cycle) * 0.05, 0);
      setJoint('head', -leftSwing * 0.18, Math.sin(state.time * 2.1) * 0.08, 0);
    } else {
      const armLeft = -rightSwing * tuning.armSwing;
      const armRight = -leftSwing * tuning.armSwing;
      setJoint('L_upperArm', armLeft, 0.04, tuning.shoulderOpen);
      setJoint('R_upperArm', armRight, -0.04, -tuning.shoulderOpen);
      setJoint('L_lowerArm', Math.max(0.1, -armLeft * 0.42 + 0.12), 0, 0.04);
      setJoint('R_lowerArm', Math.max(0.1, -armRight * 0.42 + 0.12), 0, -0.04);
      setJoint('head', breath * 0.35, Math.sin(state.time * 0.72) * tuning.idle, 0);
    }

    if (attacking) {
      const duration = Math.max(0.2, state.attackDuration ?? 0.52);
      const progress = THREE.MathUtils.clamp(1 - (state.attackTimer ?? 0) / duration, 0, 1);
      const attack = attackPose(progress);
      const power = profile === 'brute' ? 1.24 : 1;
      setJoint('hips', attack.torso * 0.34, attack.yaw * 0.45, 0);
      joints.hips.position.z += attack.lunge * bodyHeight * 0.28;
      setJoint('spine', attack.torso * 0.56, attack.yaw * 0.62, 0);
      setJoint('chest', attack.torso * 0.74, attack.yaw, -attack.arm * 0.04);
      setJoint('head', -attack.torso * 0.28, attack.yaw * 0.25, 0);
      setJoint('R_upperArm', -attack.arm * power, -0.24, -0.58 * power);
      setJoint('R_lowerArm', attack.elbow, 0.08, -0.12);
      setJoint('L_upperArm', -0.28, 0.18, 0.42);
      setJoint('L_lowerArm', 0.48, 0, 0.1);
      setJoint('R_upperLeg', -attack.lunge * 1.5, 0, -0.03);
      setJoint('L_upperLeg', attack.lunge, 0, 0.03);
    }

    const hit = THREE.MathUtils.clamp(state.hitTimer / 0.34, 0, 1);
    if (hit > 0.01) {
      const side = THREE.MathUtils.clamp(state.hitDirX ?? 0, -1, 1);
      const shake = Math.sin(state.time * 47) * hit;
      joints.hips.position.y -= hit * bodyHeight * 0.025;
      joints.hips.position.z -= hit * bodyHeight * 0.035;
      setJoint('hips', -0.16 * hit, side * 0.08, side * 0.22 * hit);
      setJoint('spine', -0.38 * hit + shake * 0.04, side * 0.18 * hit, side * 0.12 * hit);
      setJoint('chest', -0.3 * hit, side * 0.24 * hit, side * 0.18 * hit);
      setJoint('neck', 0.18 * hit, side * 0.16 * hit, 0);
      setJoint('head', 0.36 * hit + shake * 0.08, side * 0.28 * hit, shake * 0.06);
    }

    root.updateMatrixWorld(true);
  };

  const traverseMaterials = (fn: (material: THREE.Material) => void): void => {
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(fn);
    }
  };

  const dispose = (): void => {
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
  };

  return { root, update, traverseMaterials, dispose };
}
