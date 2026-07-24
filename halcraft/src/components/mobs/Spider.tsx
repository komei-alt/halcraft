// クモモブコンポーネント
// 低ポリゴンの節足造形を、インスタンス描画で軽量に表現する

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Billboard } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMobStore, type MobData } from '../../stores/useMobStore';
import { useWorldStore } from '../../stores/useWorldStore';
import {
  MOB_RIG_PROFILES,
  advanceLocomotionPhase,
  computeBodyStabilization,
  createFootPlantState,
  createLocomotionPhaseState,
  sampleGait,
  sampleRigSurfaceY,
  setSegmentTransform,
  solveTwoBoneIK,
  updatePlantedFoot,
  type TwoBoneIkResult,
} from '../../utils/mobRigMotion';

const SPIDER_EYE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff261f,
  emissive: 0xff1208,
  emissiveIntensity: 1.5,
  roughness: 0.28,
});
const SPIDER_FANG_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xd6c9a8,
  roughness: 0.58,
});

const BODY_GEOMETRY = new THREE.DodecahedronGeometry(0.5, 0);
const LEG_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const EYE_GEOMETRY = new THREE.OctahedronGeometry(1, 0);
const FANG_GEOMETRY = new THREE.ConeGeometry(0.5, 1, 5);

const LEG_DEFS = [
  { side: -1, pair: 0, z: 0.28, phase: 0 },
  { side: 1, pair: 0, z: 0.28, phase: 0.5 },
  { side: -1, pair: 1, z: 0.1, phase: 0.5 },
  { side: 1, pair: 1, z: 0.1, phase: 0 },
  { side: -1, pair: 2, z: -0.1, phase: 0 },
  { side: 1, pair: 2, z: -0.1, phase: 0.5 },
  { side: -1, pair: 3, z: -0.3, phase: 0.5 },
  { side: 1, pair: 3, z: -0.3, phase: 0 },
] as const;

const SPIDER_RIG_PROFILE = MOB_RIG_PROFILES.spider;
const SPIDER_UPPER_LEG_LENGTH = 0.5;
const SPIDER_LOWER_LEG_LENGTH = 0.46;

const EYE_POSITIONS = [
  [-0.12, 0.35, 0.51, 0.052],
  [0.12, 0.35, 0.51, 0.052],
  [-0.05, 0.27, 0.535, 0.037],
  [0.05, 0.27, 0.535, 0.037],
  [-0.2, 0.33, 0.47, 0.034],
  [0.2, 0.33, 0.47, 0.034],
  [-0.18, 0.25, 0.485, 0.03],
  [0.18, 0.25, 0.485, 0.03],
] as const;

interface SpiderProps {
  mob: MobData;
  animTime: number;
}

export function Spider({ mob, animTime }: SpiderProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const upperLegsRef = useRef<THREE.InstancedMesh>(null);
  const lowerLegsRef = useRef<THREE.InstancedMesh>(null);
  const feetRef = useRef<THREE.InstancedMesh>(null);
  const eyesRef = useRef<THREE.InstancedMesh>(null);
  const fangsRef = useRef<THREE.InstancedMesh>(null);
  const animClock = useRef(0);
  const locomotionRef = useRef(createLocomotionPhaseState((animTime * 0.37) % 1));
  const footPlantsRef = useRef(LEG_DEFS.map(() => createFootPlantState()));
  const previousRootRef = useRef(new THREE.Vector3(mob.x, mob.y, mob.z));
  const scratchRef = useRef({
    part: new THREE.Object3D(),
    hip: new THREE.Vector3(),
    restWorld: new THREE.Vector3(),
    nextWorld: new THREE.Vector3(),
    footLocal: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    toe: new THREE.Vector3(),
    rootWorld: new THREE.Vector3(),
    ik: {
      knee: new THREE.Vector3(),
      foot: new THREE.Vector3(),
      stretch: 1,
    } satisfies TwoBoneIkResult,
    footHeights: new Array<number>(LEG_DEFS.length).fill(0),
    groundHeights: new Array<number>(LEG_DEFS.length).fill(mob.y),
    frame: 0,
  });
  const hitFlashRef = useRef<THREE.Mesh>(null);
  const hitRingRef = useRef<THREE.Mesh>(null);

  // 個体ごとのマテリアル（被ダメ時も参照を固定して InstancedMesh を再マウントしない）
  const materials = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({
      color: 0x292528, roughness: 0.78, metalness: 0.05, flatShading: true,
    }),
    head: new THREE.MeshStandardMaterial({
      color: 0x373034, roughness: 0.72, metalness: 0.06, flatShading: true,
    }),
    leg: new THREE.MeshStandardMaterial({
      color: 0x473322, roughness: 0.86, flatShading: true,
    }),
  }), []);

  useEffect(() => () => {
    materials.body.dispose();
    materials.head.dispose();
    materials.leg.dispose();
  }, [materials]);

  // 被ダメ色は useFrame で毎フレーム尖らせる（useLayoutEffect だと同期遅延で弱い）

  // 目・牙は一度だけ配置
  useLayoutEffect(() => {
    const eyes = eyesRef.current;
    const fangs = fangsRef.current;
    if (!eyes || !fangs) return;

    const part = new THREE.Object3D();
    EYE_POSITIONS.forEach(([x, y, z, size], index) => {
      part.position.set(x, y, z);
      part.rotation.set(0, 0, index % 2 === 0 ? -0.16 : 0.16);
      part.scale.setScalar(size);
      part.updateMatrix();
      eyes.setMatrixAt(index, part.matrix);
    });
    eyes.instanceMatrix.needsUpdate = true;
    eyes.computeBoundingSphere();

    [-1, 1].forEach((side, index) => {
      part.position.set(side * 0.105, 0.16, 0.53);
      part.rotation.set(Math.PI - 0.22, 0, side * 0.12);
      part.scale.set(0.065, 0.16, 0.065);
      part.updateMatrix();
      fangs.setMatrixAt(index, part.matrix);
    });
    fangs.instanceMatrix.needsUpdate = true;
    fangs.computeBoundingSphere();
  }, []);

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.05);
    animClock.current += dt;
    const t = animClock.current;
    const live = useMobStore.getState().mobs.find((entry) => entry.id === mob.id) ?? mob;
    const speed = Math.hypot(live.vx, live.vz);
    const attackTimer = live.attackTimer ?? 0;
    const isAttacking = attackTimer > 0.01;
    const isMoving = !isAttacking && speed > 0.12;
    const phase = advanceLocomotionPhase(locomotionRef.current, {
      speed,
      delta: dt,
      rotation: live.rotation,
      moving: isMoving,
      profile: SPIDER_RIG_PROFILE,
    });
    const walkCycle = phase * Math.PI * 2;

    // 攻撃 progress: 0→1
    const atkProgress = isAttacking
      ? THREE.MathUtils.clamp(1 - attackTimer / 0.4, 0, 1)
      : 0;
    // 0-0.35 溜め後退 / 0.35-0.55 突進 / 0.55-1 戻し
    let lunge = 0;
    let crouch = 0;
    let fangOpen = 0;
    if (isAttacking) {
      if (atkProgress < 0.35) {
        const u = atkProgress / 0.35;
        lunge = -0.18 * u;
        crouch = 0.12 * u;
        fangOpen = 0.35 * u;
      } else if (atkProgress < 0.55) {
        const u = (atkProgress - 0.35) / 0.2;
        lunge = THREE.MathUtils.lerp(-0.18, 0.42, u);
        crouch = THREE.MathUtils.lerp(0.12, -0.06, u);
        fangOpen = THREE.MathUtils.lerp(0.35, 0.95, u);
      } else {
        const u = (atkProgress - 0.55) / 0.45;
        lunge = THREE.MathUtils.lerp(0.42, 0, u);
        crouch = THREE.MathUtils.lerp(-0.06, 0, u);
        fangOpen = THREE.MathUtils.lerp(0.95, 0, u);
      }
    }

    // 被ダメフラッシュ（白→赤）
    const hp = THREE.MathUtils.clamp(live.hitTimer / 0.34, 0, 1);
    const wf = THREE.MathUtils.clamp((live.hitTimer - 0.15) / 0.1, 0, 1);
    if (hp > 0.01) {
      const flash = 0.55 + wf * 0.45;
      materials.body.color.setRGB(flash, 0.25 + wf * 0.55, 0.22 + wf * 0.5);
      materials.head.color.setRGB(flash, 0.25 + wf * 0.55, 0.22 + wf * 0.5);
      materials.leg.color.setRGB(flash * 0.9, 0.2 + wf * 0.4, 0.15);
      materials.body.emissive.setRGB(1, 0.35 + wf * 0.5, 0.15);
      materials.body.emissiveIntensity = 0.55 + hp * 1.2 + wf * 1.4;
      materials.head.emissive.setRGB(1, 0.3 + wf * 0.5, 0.12);
      materials.head.emissiveIntensity = 0.55 + hp * 1.2 + wf * 1.4;
      materials.leg.emissive.setRGB(0.9, 0.2, 0.08);
      materials.leg.emissiveIntensity = 0.35 + hp * 0.9;
    } else {
      materials.body.color.setHex(0x292528);
      materials.head.color.setHex(0x373034);
      materials.leg.color.setHex(0x473322);
      materials.body.emissive.setHex(0x000000);
      materials.body.emissiveIntensity = 0;
      materials.head.emissive.setHex(0x000000);
      materials.head.emissiveIntensity = 0;
      materials.leg.emissive.setHex(0x000000);
      materials.leg.emissiveIntensity = 0;
    }

    const hdx = live.hitDirX ?? 0;
    const hdz = live.hitDirZ ?? 0;
    const localX = hdx * Math.cos(live.rotation) - hdz * Math.sin(live.rotation);
    const hitTilt = hp > 0
      ? Math.sin(live.hitTimer * 36) * (0.16 + hp * 0.14) - hp * 0.2
      : 0;
    const hitRoll = localX * hp * 0.45 + (hp > 0 ? Math.sin(t * 42) * hp * 0.1 : 0);

    if (rootRef.current) {
      rootRef.current.position.set(live.x, live.y, live.z);
      rootRef.current.rotation.y = live.rotation;
    }

    if (hitFlashRef.current) {
      const mat = hitFlashRef.current.material as THREE.MeshBasicMaterial;
      if (hp > 0.01) {
        hitFlashRef.current.visible = true;
        hitFlashRef.current.scale.setScalar(0.4 + (1 - hp) * 0.7 + wf * 0.3);
        mat.opacity = 0.2 + wf * 0.55 + hp * 0.2;
      } else {
        hitFlashRef.current.visible = false;
      }
    }
    if (hitRingRef.current) {
      const mat = hitRingRef.current.material as THREE.MeshBasicMaterial;
      if (hp > 0.01) {
        hitRingRef.current.visible = true;
        const s = 0.55 + (1 - hp) * 1.2;
        hitRingRef.current.scale.set(s, s, 1);
        mat.opacity = hp * 0.5;
      } else {
        hitRingRef.current.visible = false;
      }
    }

    // 牙を攻撃に合わせて開く
    const fangs = fangsRef.current;
    if (fangs) {
      const partFang = new THREE.Object3D();
      [-1, 1].forEach((side, index) => {
        partFang.position.set(side * (0.105 + fangOpen * 0.04), 0.16 - fangOpen * 0.02, 0.53 + fangOpen * 0.06);
        partFang.rotation.set(Math.PI - 0.22 - fangOpen * 0.55, 0, side * (0.12 + fangOpen * 0.35));
        partFang.scale.set(0.065, 0.16 + fangOpen * 0.04, 0.065);
        partFang.updateMatrix();
        fangs.setMatrixAt(index, partFang.matrix);
      });
      fangs.instanceMatrix.needsUpdate = true;
    }

    const upperLegs = upperLegsRef.current;
    const lowerLegs = lowerLegsRef.current;
    const feet = feetRef.current;
    if (!upperLegs || !lowerLegs || !feet) return;

    const scratch = scratchRef.current;
    // HMRで古いref形状が残った場合も、リロードなしで新LODキャッシュへ移行する。
    scratch.groundHeights ??= new Array<number>(LEG_DEFS.length).fill(live.y);
    scratch.frame = (scratch.frame ?? 0) + 1;
    const part = scratch.part;
    const rootDistance = previousRootRef.current.distanceTo(scratch.rootWorld.set(live.x, live.y, live.z));
    if (rootDistance > 2.2) {
      for (const foot of footPlantsRef.current) foot.initialized = false;
    }
    previousRootRef.current.set(live.x, live.y, live.z);

    const cos = Math.cos(live.rotation);
    const sin = Math.sin(live.rotation);
    const speedNorm = THREE.MathUtils.clamp(speed / 3.5, 0.35, 1.15);
    const getBlock = useWorldStore.getState().getBlock;
    const distanceSq = camera.position.distanceToSquared(scratch.rootWorld.set(live.x, live.y, live.z));
    const groundCadence = distanceSq > 30 * 30 ? 4 : distanceSq > 18 * 18 ? 2 : 1;

    LEG_DEFS.forEach((leg, index) => {
      const gait = sampleGait(phase, leg.phase, SPIDER_RIG_PROFILE);
      const restX = leg.side * (0.78 + leg.pair * 0.025);
      const restZ = leg.z + (leg.pair - 1.5) * 0.055;
      scratch.restWorld.set(
        live.x + cos * restX + sin * restZ,
        live.y,
        live.z - sin * restX + cos * restZ,
      );
      if (scratch.frame % groundCadence === 0 || !footPlantsRef.current[index].initialized) {
        scratch.groundHeights[index] = sampleRigSurfaceY(
          getBlock,
          scratch.restWorld.x,
          scratch.restWorld.z,
          live.y,
          SPIDER_RIG_PROFILE.maxGroundStep,
        );
      }
      const groundY = scratch.groundHeights[index];
      scratch.nextWorld.copy(scratch.restWorld);
      scratch.nextWorld.x += sin * SPIDER_RIG_PROFILE.stepReach * speedNorm;
      scratch.nextWorld.z += cos * SPIDER_RIG_PROFILE.stepReach * speedNorm;
      // 旋回中に外側の足を少し広く置き、胴体が回っても足が交差しない。
      scratch.nextWorld.x += cos * leg.side * Math.abs(gait.stride) * 0.035;
      scratch.nextWorld.z -= sin * leg.side * Math.abs(gait.stride) * 0.035;

      const planted = updatePlantedFoot(footPlantsRef.current[index], {
        gait,
        restWorld: scratch.restWorld,
        nextWorld: scratch.nextWorld,
        groundY,
        lift: SPIDER_RIG_PROFILE.footLift,
        moving: isMoving,
        delta: dt,
      });
      scratch.footHeights[index] = planted.y;

      const dx = planted.x - live.x;
      const dz = planted.z - live.z;
      scratch.footLocal.set(
        cos * dx - sin * dz,
        planted.y - live.y,
        sin * dx + cos * dz,
      );

      // 前2対は噛み付き時だけ浮かせ、後ろ4脚は接地したまま体を支える。
      const frontLeg = leg.pair <= 1;
      if (isAttacking && frontLeg) {
        scratch.footLocal.y += 0.08 + fangOpen * 0.12;
        scratch.footLocal.z += lunge * 0.42 + fangOpen * 0.13;
      }

      scratch.hip.set(
        leg.side * 0.39,
        0.27 + crouch * 0.04,
        leg.z,
      );
      scratch.pole.set(leg.side, 0.32, (leg.pair - 1.5) * 0.3).normalize();
      solveTwoBoneIK(
        scratch.hip,
        scratch.footLocal,
        scratch.pole,
        SPIDER_UPPER_LEG_LENGTH,
        SPIDER_LOWER_LEG_LENGTH,
        scratch.ik,
      );

      setSegmentTransform(part, scratch.hip, scratch.ik.knee, 0.105);
      upperLegs.setMatrixAt(index, part.matrix);
      setSegmentTransform(part, scratch.ik.knee, scratch.ik.foot, 0.082);
      lowerLegs.setMatrixAt(index, part.matrix);
      scratch.toe.copy(scratch.ik.foot).add(scratch.pole.set(leg.side * 0.08, 0, 0.08));
      setSegmentTransform(part, scratch.ik.foot, scratch.toe, 0.07);
      feet.setMatrixAt(index, part.matrix);
    });

    const stabilization = computeBodyStabilization(
      scratch.footHeights,
      live.y,
      SPIDER_RIG_PROFILE,
      phase,
    );
    const bodyBob = isMoving
      ? stabilization.bob + stabilization.lift
      : Math.sin(t * SPIDER_RIG_PROFILE.idleFrequency) * 0.008;
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.set(
        hitTilt + crouch * 0.9 - lunge * 0.25,
        localX * hp * 0.2,
        hitRoll + hitTilt * 0.2 + Math.sin(walkCycle) * SPIDER_RIG_PROFILE.bodyRoll,
      );
      bodyGroupRef.current.position.set(
        localX * hp * 0.08,
        bodyBob + crouch * 0.08 - hp * 0.05,
        lunge - hp * 0.1,
      );
      const squash = 1 - hp * 0.12;
      const widen = 1 + hp * 0.1;
      bodyGroupRef.current.scale.set(widen, squash, widen);
    }

    for (const mesh of [upperLegs, lowerLegs, feet]) {
      mesh.count = LEG_DEFS.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = true;
    }
  });

  // animTime 初回同期
  useEffect(() => {
    if (animClock.current < 0.001) animClock.current = animTime;
  }, [animTime]);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;

  return (
    <group ref={rootRef} position={[mob.x, mob.y, mob.z]} rotation={[0, mob.rotation, 0]}>
      {mob.traitAccent && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.64, 24]} />
          <meshBasicMaterial
            color={mob.traitAccent}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}

      <mesh ref={hitFlashRef} position={[0, 0.35, 0.1]} visible={false}>
        <sphereGeometry args={[0.4, 12, 10]} />
        <meshBasicMaterial
          color={0xffe8e0}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={hitRingRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.28, 0.48, 28]} />
        <meshBasicMaterial
          color={0xff4422}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group ref={bodyGroupRef}>
        {/* 多面体の腹部と頭胸部で、低ポリのまま丸い輪郭を作る */}
        <mesh
          geometry={BODY_GEOMETRY}
          material={materials.body}
          position={[0, 0.28, -0.18]}
          scale={[0.66, 0.46, 0.74]}
          castShadow
          receiveShadow
          dispose={null}
        />
        <mesh
          geometry={BODY_GEOMETRY}
          material={materials.head}
          position={[0, 0.28, 0.29]}
          scale={[0.48, 0.38, 0.46]}
          castShadow
          receiveShadow
          dispose={null}
        />

        <instancedMesh
          ref={eyesRef}
          args={[EYE_GEOMETRY, SPIDER_EYE_MATERIAL, EYE_POSITIONS.length]}
          dispose={null}
        />
        <instancedMesh
          ref={fangsRef}
          args={[FANG_GEOMETRY, SPIDER_FANG_MATERIAL, 2]}
          castShadow
          dispose={null}
        />
      </group>

      {/* 足は胴体ボブの外側に置き、スタンス中の足先をワールド座標へ固定する。 */}
      <instancedMesh
        ref={upperLegsRef}
        args={[LEG_GEOMETRY, materials.leg, LEG_DEFS.length]}
        castShadow
        receiveShadow
        dispose={null}
        visible={false}
        frustumCulled={false}
      />
      <instancedMesh
        ref={lowerLegsRef}
        args={[LEG_GEOMETRY, materials.leg, LEG_DEFS.length]}
        castShadow
        receiveShadow
        dispose={null}
        visible={false}
        frustumCulled={false}
      />
      <instancedMesh
        ref={feetRef}
        args={[LEG_GEOMETRY, materials.leg, LEG_DEFS.length]}
        castShadow
        receiveShadow
        dispose={null}
        visible={false}
        frustumCulled={false}
      />

      {mob.hp < mob.maxHp && (
        <Billboard position={[0, 0.86, 0]}>
          <mesh>
            <planeGeometry args={[0.56, 0.06]} />
            <meshBasicMaterial
              color={0x222222}
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[-(0.56 - 0.56 * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[0.56 * hpRatio, 0.04]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
