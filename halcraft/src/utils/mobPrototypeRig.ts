// プロトタイプ専用の剛体マルチパーツ・リグ。
// Nomad Sculpt の149メッシュを再スキニングせず、元の線・材質を保ったまま
// 蜘蛛型の8本脚へ自動分類して、足固定と2ボーンIKで駆動する。

import * as THREE from 'three';
import type { MobRigAnimState, ProceduralMobRig } from './mobProceduralRig';
import {
  MOB_RIG_PROFILES,
  advanceLocomotionPhase,
  computeBodyStabilization,
  createFootPlantState,
  createLocomotionPhaseState,
  sampleGait,
  sampleRigSurfaceY,
  solveTwoBoneIK,
  updatePlantedFoot,
  type FootPlantState,
  type TwoBoneIkResult,
} from './mobRigMotion';

const LEG_COUNT = 8;
const FULL_TURN = Math.PI * 2;
const PROFILE = MOB_RIG_PROFILES.prototype_arachnid;

interface SourcePart {
  source: THREE.Mesh;
  worldMatrix: THREE.Matrix4;
  box: THREE.Box3;
  center: THREE.Vector3;
  legIndex: number | null;
}

interface PrototypeLeg {
  index: number;
  phaseOffset: number;
  direction: THREE.Vector3;
  hipRest: THREE.Vector3;
  kneeRest: THREE.Vector3;
  footRest: THREE.Vector3;
  upperRest: THREE.Vector3;
  lowerRest: THREE.Vector3;
  upperLength: number;
  lowerLength: number;
  hipPivot: THREE.Group;
  kneePivot: THREE.Group;
  footPivot: THREE.Group;
  footPlant: FootPlantState;
  targetLocal: THREE.Vector3;
  ik: TwoBoneIkResult;
}

function cloneMaterial(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  clone.depthTest = true;
  clone.depthWrite = true;
  return clone;
}

function cloneRigidMesh(source: THREE.Mesh): THREE.Mesh {
  const material = Array.isArray(source.material)
    ? source.material.map(cloneMaterial)
    : cloneMaterial(source.material);
  const mesh = new THREE.Mesh(source.geometry, material);
  mesh.name = source.name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}

function attachMatrixToParent(
  object: THREE.Object3D,
  parent: THREE.Object3D,
  worldMatrix: THREE.Matrix4,
  inverseScratch: THREE.Matrix4,
  localScratch: THREE.Matrix4,
): void {
  parent.updateWorldMatrix(true, false);
  inverseScratch.copy(parent.matrixWorld).invert();
  localScratch.multiplyMatrices(inverseScratch, worldMatrix);
  localScratch.decompose(object.position, object.quaternion, object.scale);
  parent.add(object);
}

function collectSourceParts(sourceScene: THREE.Object3D): SourcePart[] {
  sourceScene.updateMatrixWorld(true);
  const parts: SourcePart[] = [];
  sourceScene.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const worldMatrix = child.matrixWorld.clone();
    const box = child.geometry.boundingBox!.clone().applyMatrix4(worldMatrix);
    const center = box.getCenter(new THREE.Vector3());
    parts.push({ source: child, worldMatrix, box, center, legIndex: null });
  });
  return parts;
}

function combinedBox(parts: readonly SourcePart[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const part of parts) box.union(part.box);
  return box;
}

function classifyLegParts(
  parts: SourcePart[],
  box: THREE.Box3,
): { bodyCenter: THREE.Vector3; buckets: SourcePart[][] } {
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(0.001, size.y);
  const upperCut = box.max.y - height * 0.25;
  const legCut = box.max.y - height * 0.235;

  const bodyCenter = new THREE.Vector3();
  let bodyWeight = 0;
  for (const part of parts) {
    if (part.center.y < upperCut) continue;
    const vertices = part.source.geometry.getAttribute('position')?.count ?? 1;
    const weight = Math.max(1, Math.sqrt(vertices));
    bodyCenter.addScaledVector(part.center, weight);
    bodyWeight += weight;
  }
  if (bodyWeight > 0) bodyCenter.multiplyScalar(1 / bodyWeight);
  else box.getCenter(bodyCenter);

  const radialThreshold = Math.max(0.42, Math.max(size.x, size.z) * 0.075);
  const buckets = Array.from({ length: LEG_COUNT }, () => [] as SourcePart[]);
  for (const part of parts) {
    const dx = part.center.x - bodyCenter.x;
    const dz = part.center.z - bodyCenter.z;
    const radial = Math.hypot(dx, dz);
    const lowerEnough = part.center.y < legCut;
    const reachesDown = part.box.min.y < box.min.y + height * 0.66;
    if (!lowerEnough || !reachesDown || radial < radialThreshold) continue;

    const angle = Math.atan2(dx, dz);
    const normalized = ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
    const index = Math.round(normalized / (FULL_TURN / LEG_COUNT)) % LEG_COUNT;
    part.legIndex = index;
    buckets[index].push(part);
  }

  return { bodyCenter, buckets };
}

function createLeg(
  index: number,
  parts: readonly SourcePart[],
  bodyCenter: THREE.Vector3,
  box: THREE.Box3,
): PrototypeLeg | null {
  if (parts.length === 0) return null;

  const sectorAngle = (index / LEG_COUNT) * FULL_TURN;
  const direction = new THREE.Vector3(Math.sin(sectorAngle), 0, Math.cos(sectorAngle));
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(0.001, size.y);
  const hipRadius = Math.max(0.48, Math.min(size.x, size.z) * 0.11);
  const hipRest = new THREE.Vector3(
    bodyCenter.x + direction.x * hipRadius,
    box.max.y - height * 0.25,
    bodyCenter.z + direction.z * hipRadius,
  );

  let minY = Number.POSITIVE_INFINITY;
  const lowCenters: THREE.Vector3[] = [];
  for (const part of parts) minY = Math.min(minY, part.box.min.y);
  const lowBand = minY + height * 0.13;
  for (const part of parts) {
    if (part.center.y <= lowBand || part.box.min.y <= minY + height * 0.04) {
      lowCenters.push(part.center);
    }
  }

  const footRest = new THREE.Vector3();
  const samples = lowCenters.length > 0 ? lowCenters : parts.map((part) => part.center);
  for (const center of samples) footRest.add(center);
  footRest.multiplyScalar(1 / Math.max(1, samples.length));
  footRest.y = minY + Math.max(0.02, height * 0.012);

  // 誤分類で足先が胴体直下に寄った場合は、元パーツの外向き範囲へ補正する。
  const radial = Math.hypot(footRest.x - bodyCenter.x, footRest.z - bodyCenter.z);
  if (radial < hipRadius * 1.25) {
    footRest.x = bodyCenter.x + direction.x * hipRadius * 2.4;
    footRest.z = bodyCenter.z + direction.z * hipRadius * 2.4;
  }

  const kneeRest = hipRest.clone().lerp(footRest, 0.48)
    .addScaledVector(direction, Math.max(0.14, hipRest.distanceTo(footRest) * 0.09));
  const upperRest = kneeRest.clone().sub(hipRest);
  const lowerRest = footRest.clone().sub(kneeRest);

  const hipPivot = new THREE.Group();
  const kneePivot = new THREE.Group();
  const footPivot = new THREE.Group();
  hipPivot.name = `prototype_leg_${index}_hip`;
  kneePivot.name = `prototype_leg_${index}_knee`;
  footPivot.name = `prototype_leg_${index}_foot`;
  hipPivot.position.copy(hipRest);
  kneePivot.position.copy(upperRest);
  footPivot.position.copy(lowerRest);
  hipPivot.add(kneePivot);
  kneePivot.add(footPivot);

  return {
    index,
    // 左前・右後を同時に動かす交互4脚パターン。
    phaseOffset: index % 2 === 0 ? 0 : 0.5,
    direction,
    hipRest,
    kneeRest,
    footRest,
    upperRest,
    lowerRest,
    upperLength: Math.max(0.12, upperRest.length()),
    lowerLength: Math.max(0.12, lowerRest.length()),
    hipPivot,
    kneePivot,
    footPivot,
    footPlant: createFootPlantState(),
    targetLocal: footRest.clone(),
    ik: {
      knee: new THREE.Vector3(),
      foot: new THREE.Vector3(),
      stretch: 1,
    },
  };
}

function chooseLegParent(part: SourcePart, leg: PrototypeLeg): THREE.Group {
  const totalDrop = Math.max(0.001, leg.hipRest.y - leg.footRest.y);
  const t = THREE.MathUtils.clamp((leg.hipRest.y - part.center.y) / totalDrop, 0, 1);
  if (t < 0.42) return leg.hipPivot;
  if (t < 0.86) return leg.kneePivot;
  return leg.footPivot;
}

function attackEnvelope(progress: number): { pitch: number; lunge: number; lift: number } {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  if (p < 0.32) {
    const u = p / 0.32;
    return { pitch: -0.12 * u, lunge: -0.1 * u, lift: 0.18 * u };
  }
  if (p < 0.54) {
    const u = (p - 0.32) / 0.22;
    return {
      pitch: THREE.MathUtils.lerp(-0.12, 0.22, u),
      lunge: THREE.MathUtils.lerp(-0.1, 0.42, u),
      lift: THREE.MathUtils.lerp(0.18, 0.34, u),
    };
  }
  const u = (p - 0.54) / 0.46;
  return {
    pitch: THREE.MathUtils.lerp(0.22, 0, u),
    lunge: THREE.MathUtils.lerp(0.42, 0, u),
    lift: THREE.MathUtils.lerp(0.34, 0, u),
  };
}

/** プロトタイプの元モデルから剛体8脚リグを構築する。 */
export function buildPrototypeMultipartRig(sourceScene: THREE.Object3D): ProceduralMobRig | null {
  const sourceParts = collectSourceParts(sourceScene);
  if (sourceParts.length === 0) return null;

  const box = combinedBox(sourceParts);
  if (box.isEmpty()) return null;
  const { bodyCenter, buckets } = classifyLegParts(sourceParts, box);

  const root = new THREE.Group();
  root.name = 'prototypeArachnidRig';
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'prototype_body';
  root.add(bodyPivot);

  const legs: PrototypeLeg[] = [];
  for (let index = 0; index < LEG_COUNT; index++) {
    const leg = createLeg(index, buckets[index], bodyCenter, box);
    if (!leg) continue;
    root.add(leg.hipPivot);
    legs.push(leg);
  }
  if (legs.length < 4) return null;
  root.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  const inverseScratch = new THREE.Matrix4();
  const localScratch = new THREE.Matrix4();
  for (const part of sourceParts) {
    const clone = cloneRigidMesh(part.source);
    const leg = part.legIndex === null
      ? null
      : legs.find((candidate) => candidate.index === part.legIndex) ?? null;
    const parent = leg ? chooseLegParent(part, leg) : bodyPivot;
    attachMatrixToParent(clone, parent, part.worldMatrix, inverseScratch, localScratch);
    meshes.push(clone);
  }

  root.updateMatrixWorld(true);
  const phaseState = createLocomotionPhaseState();
  let lodFrame = 0;
  let accumulatedDelta = 0;
  const scratch = {
    restWorld: new THREE.Vector3(),
    nextWorld: new THREE.Vector3(),
    targetLocal: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    upperTarget: new THREE.Vector3(),
    lowerTarget: new THREE.Vector3(),
    upperQuat: new THREE.Quaternion(),
    lowerQuat: new THREE.Quaternion(),
    combinedQuat: new THREE.Quaternion(),
    inverseUpperQuat: new THREE.Quaternion(),
    footHeights: new Array<number>(legs.length).fill(0),
  };

  const update = (state: MobRigAnimState): void => {
    accumulatedDelta += Math.min(state.delta ?? 1 / 60, 0.05);
    lodFrame++;
    if (state.lod === 2 && lodFrame % 2 !== 0) return;
    const delta = Math.min(accumulatedDelta, 0.08);
    accumulatedDelta = 0;
    const rotation = state.rotation ?? 0;
    const moving = state.moving && state.speed > 0.05 && (state.attackTimer ?? 0) <= 0.01;
    const phase = advanceLocomotionPhase(phaseState, {
      speed: state.speed,
      delta,
      rotation,
      moving,
      profile: PROFILE,
    });
    const scale = Math.max(0.001, state.modelScale ?? 1);
    const worldX = state.worldX ?? 0;
    const worldY = state.worldY ?? 0;
    const worldZ = state.worldZ ?? 0;
    const anchorX = state.anchorOffsetX ?? 0;
    const anchorY = state.anchorOffsetY ?? 0;
    const anchorZ = state.anchorOffsetZ ?? 0;
    const modelYaw = state.modelYaw ?? 0;
    const yaw = rotation + modelYaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const speedNorm = THREE.MathUtils.clamp(state.speed / 3, 0.35, 1.25);
    const attacking = (state.attackTimer ?? 0) > 0.01;
    const attackDuration = Math.max(0.2, state.attackDuration ?? 0.52);
    const attackProgress = attacking
      ? THREE.MathUtils.clamp(1 - (state.attackTimer ?? 0) / attackDuration, 0, 1)
      : 0;
    const attack = attackEnvelope(attackProgress);

    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
      const leg = legs[legIndex];
      const gait = sampleGait(phase, leg.phaseOffset, PROFILE);
      const localX = leg.footRest.x;
      const localZ = leg.footRest.z;
      scratch.restWorld.set(
        worldX + anchorX + (cos * localX + sin * localZ) * scale,
        worldY,
        worldZ + anchorZ + (-sin * localX + cos * localZ) * scale,
      );
      const groundY = state.getBlock
        ? sampleRigSurfaceY(
          state.getBlock,
          scratch.restWorld.x,
          scratch.restWorld.z,
          worldY,
          PROFILE.maxGroundStep,
        )
        : worldY;
      scratch.nextWorld.copy(scratch.restWorld);
      scratch.nextWorld.x += Math.sin(rotation) * PROFILE.stepReach * speedNorm;
      scratch.nextWorld.z += Math.cos(rotation) * PROFILE.stepReach * speedNorm;

      const planted = updatePlantedFoot(leg.footPlant, {
        gait,
        restWorld: scratch.restWorld,
        nextWorld: scratch.nextWorld,
        groundY,
        lift: PROFILE.footLift,
        moving,
        delta,
      });
      scratch.footHeights[legIndex] = planted.y;

      const dx = (planted.x - worldX - anchorX) / scale;
      const dz = (planted.z - worldZ - anchorZ) / scale;
      scratch.targetLocal.set(
        cos * dx - sin * dz,
        (planted.y - worldY - anchorY) / scale,
        sin * dx + cos * dz,
      );

      // 正面2脚だけを攻撃へ使い、残り6脚は足固定のまま支持脚にする。
      const isFrontStriker = leg.direction.z > 0.62;
      if (attacking && isFrontStriker) {
        scratch.targetLocal.y += attack.lift / scale;
        scratch.targetLocal.z += attack.lunge / scale;
      }
      leg.targetLocal.copy(scratch.targetLocal);
    }

    const stabilization = computeBodyStabilization(
      scratch.footHeights,
      worldY,
      PROFILE,
      phase,
    );
    const idle = Math.sin(state.time * PROFILE.idleFrequency);
    const hit = THREE.MathUtils.clamp(state.hitTimer / 0.34, 0, 1);
    const hitSide = THREE.MathUtils.clamp(state.hitDirX ?? 0, -1, 1);
    const localLift = (stabilization.lift + (moving ? stabilization.bob : idle * 0.018)) / scale;
    bodyPivot.position.set(
      hitSide * hit * 0.12 / scale,
      localLift - hit * 0.08 / scale,
      attacking ? attack.lunge * 0.18 / scale : 0,
    );
    bodyPivot.rotation.set(
      (attacking ? attack.pitch : 0) - hit * 0.16,
      moving ? Math.sin(phase * FULL_TURN) * 0.025 : idle * 0.008,
      Math.sin(phase * FULL_TURN) * PROFILE.bodyRoll + hitSide * hit * 0.22,
    );

    // 胴体と股関節を同じ高さへ運び、固定された足先に対して脚だけを解かせる。
    for (const leg of legs) {
      leg.hipPivot.position.copy(leg.hipRest);
      leg.hipPivot.position.y += localLift;
      if (attacking) leg.hipPivot.position.z += attack.lunge * 0.18 / scale;

      scratch.pole.copy(leg.direction).setY(0.34).normalize();
      solveTwoBoneIK(
        leg.hipPivot.position,
        leg.targetLocal,
        scratch.pole,
        leg.upperLength,
        leg.lowerLength,
        leg.ik,
      );

      scratch.upperTarget.subVectors(leg.ik.knee, leg.hipPivot.position).normalize();
      scratch.upperQuat.setFromUnitVectors(
        scratch.pole.copy(leg.upperRest).normalize(),
        scratch.upperTarget,
      );
      leg.hipPivot.quaternion.copy(scratch.upperQuat);

      scratch.lowerTarget.subVectors(leg.ik.foot, leg.ik.knee).normalize();
      scratch.inverseUpperQuat.copy(scratch.upperQuat).invert();
      scratch.lowerTarget.applyQuaternion(scratch.inverseUpperQuat);
      scratch.lowerQuat.setFromUnitVectors(
        scratch.pole.copy(leg.lowerRest).normalize(),
        scratch.lowerTarget,
      );
      leg.kneePivot.quaternion.copy(scratch.lowerQuat);
      scratch.combinedQuat.copy(scratch.upperQuat).multiply(scratch.lowerQuat).invert();
      leg.footPivot.quaternion.copy(scratch.combinedQuat);
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
