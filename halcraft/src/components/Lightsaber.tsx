// ライトセイバー武器コンポーネント
// FPSビューで光る刃を描画し、5段コンボ攻撃・PointLight光源・効果音を統合
// スターウォーズ風のライトセイバーをイメージ

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useGameStore } from '../stores/useGameStore';

import { mobileActions } from '../utils/touchInput';
import { getMobHitbox, getMobHitboxMinY, getMobHitboxMaxY } from '../utils/mobHitboxes';
import { spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import {
  playLightsaberIgnite,
  playLightsaberSwing,
  playLightsaberHit,
  setLightsaberHumIntensity,
  startLightsaberHumLoop,
  stopLightsaberHumLoop,
} from '../utils/lightsaberSounds';

// ============================================
// 定数
// ============================================

/** ライトセイバーの色パレット */
const BLADE_COLORS = [
  '#4488ff', // 青
  '#44ff44', // 緑
  '#ff4444', // 赤
  '#aa44ff', // 紫
  '#ff8800', // オレンジ
  '#ffff44', // 黄
];

/** ダメージ */
const LIGHTSABER_BASE_DAMAGE = 5;
/** 攻撃リーチ */
const ATTACK_REACH = 4.0;
/** モブ判定半径 */

/** プレイヤー判定 */
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;

/** コンボリセットまでの猶予（秒） */
const COMBO_RESET_TIME = 0.8;

/** FPS表示オフセット */
const IDLE_OFFSET = new THREE.Vector3(0.46, -0.48, -0.68);
const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';
const BLADE_LENGTH = 1.55;
const BLADE_CENTER = BLADE_LENGTH / 2;
const TRAIL_SEGMENT_COUNT = 10;
const TRAIL_LIFETIME = 0.22;
const TRAIL_SAMPLE_INTERVAL = 0.012;
const BLADE_BASE_LOCAL = new THREE.Vector3(0, 0.02, 0);
const BLADE_TIP_LOCAL = new THREE.Vector3(0, BLADE_LENGTH + 0.04, 0);

// ============================================
// コンボ定義
// ============================================

interface ComboStep {
  /** 持続時間（秒） */
  duration: number;
  /** ダメージ倍率 */
  damageMultiplier: number;
  /** 開始回転（Euler） */
  startEuler: [number, number, number];
  /** 中間回転（Euler） */
  midEuler: [number, number, number];
  /** 終了回転（Euler） */
  endEuler: [number, number, number];
  /** 開始位置オフセット（カメラ相対） */
  startOffset: [number, number, number];
  /** 中間位置オフセット（カメラ相対） */
  midOffset: [number, number, number];
  /** 終了位置オフセット（カメラ相対） */
  endOffset: [number, number, number];
  /** ダメージ判定を置くスイング進行度 */
  hitWindow: [number, number];
}

const COMBO_STEPS: ComboStep[] = [
  {
    // Step 1: 右肩から左下へ大きく払う
    duration: 0.36,
    damageMultiplier: 1.0,
    startEuler: [0.75, -1.25, -1.25],
    midEuler: [0.05, 0.05, -0.25],
    endEuler: [-0.18, 1.35, 0.72],
    startOffset: [0.78, -0.08, -0.34],
    midOffset: [0.08, -0.24, -1.02],
    endOffset: [-0.58, -0.42, -0.74],
    hitWindow: [0.34, 0.62],
  },
  {
    // Step 2: 左から右へ切り返す
    duration: 0.34,
    damageMultiplier: 1.1,
    startEuler: [0.04, 1.28, 0.78],
    midEuler: [0.22, -0.05, 0.1],
    endEuler: [0.36, -1.15, -0.92],
    startOffset: [-0.56, -0.38, -0.72],
    midOffset: [0.0, -0.22, -1.02],
    endOffset: [0.72, -0.36, -0.64],
    hitWindow: [0.32, 0.6],
  },
  {
    // Step 3: 低い位置から上へ斬り上げる
    duration: 0.38,
    damageMultiplier: 1.2,
    startEuler: [1.05, -0.72, -1.42],
    midEuler: [-0.18, -0.1, -0.45],
    endEuler: [-0.92, 0.58, 0.72],
    startOffset: [0.68, -0.72, -0.42],
    midOffset: [0.24, -0.34, -0.98],
    endOffset: [-0.18, 0.18, -0.82],
    hitWindow: [0.3, 0.58],
  },
  {
    // Step 4: 大きく引いてから突く
    duration: 0.3,
    damageMultiplier: 1.3,
    startEuler: [0.18, -0.35, -0.45],
    midEuler: [-0.08, -0.04, -0.1],
    endEuler: [-0.2, 0.02, 0.08],
    startOffset: [0.62, -0.42, -0.22],
    midOffset: [0.34, -0.34, -0.88],
    endOffset: [0.06, -0.24, -1.42],
    hitWindow: [0.42, 0.72],
  },
  {
    // Step 5: フィニッシュの大回転斬り
    duration: 0.56,
    damageMultiplier: 1.8,
    startEuler: [0.38, -1.18, -0.7],
    midEuler: [0.12, 2.55, 0.34],
    endEuler: [0.34, 6.45, -0.55],
    startOffset: [0.66, -0.2, -0.62],
    midOffset: [-0.18, -0.18, -1.04],
    endOffset: [0.62, -0.28, -0.68],
    hitWindow: [0.24, 0.78],
  },
];

// ============================================
// イージング
// ============================================

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function interpolateArc(
  start: [number, number, number],
  mid: [number, number, number],
  end: [number, number, number],
  t: number,
): [number, number, number] {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const left = clamped < 0.5;
  const localT = left ? clamped * 2 : (clamped - 0.5) * 2;
  const a = left ? start : mid;
  const b = left ? mid : end;
  const e = easeInOutCubic(localT);
  return [
    a[0] + (b[0] - a[0]) * e,
    a[1] + (b[1] - a[1]) * e,
    a[2] + (b[2] - a[2]) * e,
  ];
}

interface BladeTrailSample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

// ============================================
// コンポーネント
// ============================================

export function Lightsaber() {
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);
  const phase = useGameStore((s) => s.phase);
  const { camera } = useThree();

  // ライトセイバーの色（初回マウント時にランダム選択）
  const [bladeColor] = useState(() => {
    const idx = Math.floor(Math.random() * BLADE_COLORS.length);
    return BLADE_COLORS[idx];
  });

  const bladeColorObj = useMemo(() => new THREE.Color(bladeColor), [bladeColor]);
  const coreColor = useMemo(() => {
    const c = new THREE.Color(bladeColor);
    c.lerp(new THREE.Color('#ffffff'), 0.65);
    return c;
  }, [bladeColor]);

  // Refs
  const weaponRef = useRef<THREE.Group>(null);
  const bladeGroupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const trailGeometries = useRef<Array<THREE.BufferGeometry<THREE.NormalOrGLBufferAttributes> | null>>([]);
  const trailMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const trailSamples = useRef<BladeTrailSample[]>([]);
  const trailSampleTimer = useRef(0);
  const bladeActivation = useRef(0);
  const offsetWorld = useRef(new THREE.Vector3());
  const attackDir = useRef(new THREE.Vector3());
  const tempOrigin = useRef(new THREE.Vector3());
  const tempToTarget = useRef(new THREE.Vector3());
  const tempClosest = useRef(new THREE.Vector3());
  const tempTrailBase = useRef(new THREE.Vector3());
  const tempTrailTip = useRef(new THREE.Vector3());
  const localQuat = useRef(new THREE.Quaternion());
  const localEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  // コンボ状態
  const comboIndex = useRef(0);
  const swingProgress = useRef(0); // 0=アイドル、0-1=スイング中
  const isSwinging = useRef(false);
  const lastComboTime = useRef(0);
  const hasHitThisSwing = useRef(false);
  const lightBoost = useRef(0);
  const wasEquipped = useRef(false);

  // ダメージ適用
  const applyDamage = useCallback((comboStep: number) => {
    const step = COMBO_STEPS[comboStep];
    const damage = Math.max(1, Math.round(LIGHTSABER_BASE_DAMAGE * step.damageMultiplier));

    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    tempOrigin.current.copy(camera.position);
    const dir = attackDir.current;
    const origin = tempOrigin.current;

    // リモートプレイヤーへのヒット判定
    const multiState = useMultiplayerStore.getState();
    if (multiState.connected) {
      let closestPlayerDist = ATTACK_REACH;
      let closestPlayerId: string | null = null;
      let closestPlayerPos: [number, number, number] | null = null;

      for (const [, player] of multiState.remotePlayers) {
        tempToTarget.current.set(
          player.position[0] - origin.x,
          player.position[1] + PLAYER_HIT_HEIGHT * 0.5 - origin.y,
          player.position[2] - origin.z,
        );
        const projection = tempToTarget.current.dot(dir);
        if (projection < 0 || projection > ATTACK_REACH) continue;

        tempClosest.current.copy(origin).addScaledVector(dir, projection);
        const targetX = origin.x + tempToTarget.current.x;
        const targetY = origin.y + tempToTarget.current.y;
        const targetZ = origin.z + tempToTarget.current.z;
        const dx = tempClosest.current.x - targetX;
        const dy = tempClosest.current.y - targetY;
        const dz = tempClosest.current.z - targetZ;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < PLAYER_HIT_RADIUS + 0.3 && projection < closestPlayerDist) {
          closestPlayerDist = projection;
          closestPlayerId = player.id;
          closestPlayerPos = [targetX, targetY, targetZ];
        }
      }

      if (closestPlayerId && closestPlayerPos) {
        multiState.sendPlayerAttack(closestPlayerId, damage, dir.x, dir.z);
        spawnHitImpactEffect(
          closestPlayerPos[0], closestPlayerPos[1], closestPlayerPos[2],
          dir.x, dir.y, dir.z, step.damageMultiplier >= 1.5,
        );
        playLightsaberHit();
        lightBoost.current = 1;
        hasHitThisSwing.current = true;
        return true;
      }
    }

    // モブへのヒット判定
    const mobs = useMobStore.getState().mobs;
    let closestMobDist = ATTACK_REACH;
    let closestMobId: string | null = null;
    let closestMobPos: { x: number; y: number; z: number; hitY: number } | null = null;

    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;

      const hitbox = getMobHitbox(mob.type);
      const minY = getMobHitboxMinY(mob.y, hitbox);
      const maxY = getMobHitboxMaxY(mob.y, hitbox);
      const centerY = mob.y + hitbox.height * 0.5;

      tempToTarget.current.set(mob.x - origin.x, centerY - origin.y, mob.z - origin.z);
      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > closestMobDist) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const dx = tempClosest.current.x - mob.x;
      const hitY = Math.max(minY, Math.min(maxY, tempClosest.current.y));
      const dy = tempClosest.current.y - hitY;
      const dz = tempClosest.current.z - mob.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < hitbox.radius && projection < closestMobDist) {
        closestMobDist = projection;
        closestMobId = mob.id;
        closestMobPos = { x: mob.x, y: mob.y, z: mob.z, hitY };
      }
    }

    if (closestMobId && closestMobPos) {
      const isCritical = step.damageMultiplier >= 1.5;
      useMobStore.getState().damageMob(closestMobId, damage, dir.x, dir.z);
      useMultiplayerStore.getState().sendMobDamage(closestMobId, damage, dir.x * 1.5, dir.z * 1.5);
      spawnDamagePopup(damage, closestMobPos.x, closestMobPos.hitY - 1.0, closestMobPos.z, isCritical);
      spawnHitImpactEffect(
        closestMobPos.x, closestMobPos.hitY, closestMobPos.z,
        dir.x, dir.y, dir.z, isCritical,
      );
      playLightsaberHit();
      lightBoost.current = 1;
      hasHitThisSwing.current = true;
      return true;
    }

    return false;
  }, [camera]);

  // スイング開始
  const startSwing = useCallback(() => {
    if (isSwinging.current) return;
    const now = performance.now() / 1000;

    // コンボリセット判定
    if (now - lastComboTime.current > COMBO_RESET_TIME) {
      comboIndex.current = 0;
    }

    isSwinging.current = true;
    swingProgress.current = 0;
    hasHitThisSwing.current = false;
    lastComboTime.current = now;
    playLightsaberSwing(comboIndex.current);
  }, []);

  // マウスイベント登録
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!document.pointerLockElement) return;
      if (usePlayerStore.getState().equippedItem !== 'lightsaber') return;
      if (usePlayerStore.getState().isDead) return;
      if (useVehicleStore.getState().isInVehicle()) return;
      if (useGameStore.getState().phase !== 'playing') return;
      startSwing();
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [startSwing]);

  useEffect(() => () => stopLightsaberHumLoop(), []);

  // メインフレームループ
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const visible = equippedItem === 'lightsaber'
      && !isDead
      && phase === 'playing'
      && !useVehicleStore.getState().isInVehicle();

    // 装備切替検出 → イグニッション音
    if (visible && !wasEquipped.current) {
      playLightsaberIgnite();
      startLightsaberHumLoop();
    } else if (!visible && wasEquipped.current) {
      stopLightsaberHumLoop();
    }
    wasEquipped.current = visible;

    // 非表示時はリセット
    if (!visible) {
      isSwinging.current = false;
      swingProgress.current = 0;
      comboIndex.current = 0;
      bladeActivation.current = 0;
      trailSamples.current = [];
      for (const material of trailMaterials.current) {
        if (material) material.opacity = 0;
      }
    }

    // ウェポングループの表示/位置制御
    if (weaponRef.current) {
      weaponRef.current.visible = visible;
      if (!visible) return;

      bladeActivation.current = Math.min(1, bladeActivation.current + dt * 7.5);
      if (bladeGroupRef.current) {
        const bladeScale = easeOutQuad(bladeActivation.current);
        bladeGroupRef.current.scale.set(1, bladeScale, 1);
      }

      // スイングアニメーション処理
      if (isSwinging.current) {
        const step = COMBO_STEPS[comboIndex.current];
        swingProgress.current += dt / step.duration;

        if (swingProgress.current >= 1) {
          // スイング完了
          swingProgress.current = 1;
          isSwinging.current = false;

          // ダメージ判定はスイング中間で実行（モーション0.4付近）
          // → 終了時にもう一度チャンス
          if (!hasHitThisSwing.current) {
            applyDamage(comboIndex.current);
          }

          // 次のコンボへ
          comboIndex.current = (comboIndex.current + 1) % COMBO_STEPS.length;
          lastComboTime.current = performance.now() / 1000;
        } else if (
          swingProgress.current > step.hitWindow[0]
          && swingProgress.current < step.hitWindow[1]
          && !hasHitThisSwing.current
        ) {
          // スイング中間でダメージ判定
          applyDamage(comboIndex.current);
        }

        // スイング中のポジション・回転を補間
        const t = easeInOutCubic(swingProgress.current);
        const s = COMBO_STEPS[comboIndex.current];

        const [lx, ly, lz] = interpolateArc(s.startOffset, s.midOffset, s.endOffset, t);

        offsetWorld.current.set(lx, ly, lz).applyQuaternion(camera.quaternion);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);

        const [rx, ry, rz] = interpolateArc(s.startEuler, s.midEuler, s.endEuler, t);

        localEuler.current.set(rx, ry, rz, 'YXZ');
        localQuat.current.setFromEuler(localEuler.current);
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(localQuat.current);
      } else {
        // アイドルポジション — 右下に構える
        offsetWorld.current.copy(IDLE_OFFSET).applyQuaternion(camera.quaternion);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);

        localEuler.current.set(0.36, -0.26, -0.82, 'YXZ');
        localQuat.current.setFromEuler(localEuler.current);
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(localQuat.current);
      }
    }

    // モバイルタッチ入力対応
    if (visible && mobileActions.breakBlock) {
      startSwing();
    }

    // 刃の残像。スイング中は刃の根元と先端を世界座標で記録し、面でつなぐ。
    for (const sample of trailSamples.current) {
      sample.age += dt;
    }
    trailSamples.current = trailSamples.current.filter((sample) => sample.age < TRAIL_LIFETIME);

    const trailActive = visible && (isSwinging.current || lightBoost.current > 0.15);
    trailSampleTimer.current += dt;
    if (trailActive && bladeGroupRef.current && trailSampleTimer.current >= TRAIL_SAMPLE_INTERVAL) {
      trailSampleTimer.current = 0;
      bladeGroupRef.current.updateWorldMatrix(true, false);
      tempTrailBase.current.copy(BLADE_BASE_LOCAL);
      tempTrailTip.current.copy(BLADE_TIP_LOCAL);
      bladeGroupRef.current.localToWorld(tempTrailBase.current);
      bladeGroupRef.current.localToWorld(tempTrailTip.current);
      trailSamples.current.unshift({
        base: tempTrailBase.current.clone(),
        tip: tempTrailTip.current.clone(),
        age: 0,
      });
      if (trailSamples.current.length > TRAIL_SEGMENT_COUNT + 1) {
        trailSamples.current.length = TRAIL_SEGMENT_COUNT + 1;
      }
    }

    for (let i = 0; i < TRAIL_SEGMENT_COUNT; i++) {
      const geo = trailGeometries.current[i];
      const material = trailMaterials.current[i];
      const newer = trailSamples.current[i];
      const older = trailSamples.current[i + 1];
      if (!geo || !material || !newer || !older) {
        if (material) material.opacity = 0;
        continue;
      }

      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const points = [older.base, older.tip, newer.tip, older.base, newer.tip, newer.base];
      for (let p = 0; p < points.length; p++) {
        attr.setXYZ(p, points[p].x, points[p].y, points[p].z);
      }
      attr.needsUpdate = true;
      geo.computeBoundingSphere();

      const ageFade = 1 - newer.age / TRAIL_LIFETIME;
      const orderFade = 1 - i / TRAIL_SEGMENT_COUNT;
      material.opacity = Math.max(0, ageFade * orderFade * 0.42);
    }

    // PointLight 動的制御
    lightBoost.current = Math.max(0, lightBoost.current - dt * 8);
    if (lightRef.current && visible) {
      const baseIntensity = 3;
      const swingBoost = isSwinging.current ? 4 : 0;
      const hitFlash = lightBoost.current * 5;
      // アイドルフリッカー
      const flicker = Math.sin(performance.now() * 0.003) * 0.3
        + Math.sin(performance.now() * 0.007) * 0.15;
      lightRef.current.intensity = baseIntensity + swingBoost + hitFlash + flicker;
      lightRef.current.distance = isSwinging.current ? 15 : 9;
      lightRef.current.color.copy(bladeColorObj);
    } else if (lightRef.current) {
      lightRef.current.intensity = 0;
    }

    if (visible) {
      setLightsaberHumIntensity((isSwinging.current ? 0.82 : 0.22) + lightBoost.current * 0.45);
    }
  });

  return (
    <group>
      {Array.from({ length: TRAIL_SEGMENT_COUNT }, (_, index) => (
        <mesh key={`lightsaber-trail-${index}`} frustumCulled={false}>
          <bufferGeometry
            ref={(geo) => {
              trailGeometries.current[index] = geo;
            }}
          >
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(18), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial
            ref={(material) => {
              trailMaterials.current[index] = material;
            }}
            color={bladeColorObj}
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
      <group ref={weaponRef} visible={false}>
        {/* ヒルト（柄） */}
        <mesh position={[0, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.035, 0.4, 8]} />
          <meshStandardMaterial color="#888899" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* グリップリング 1 */}
        <mesh position={[0, -0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.042, 0.008, 6, 12]} />
          <meshStandardMaterial color="#555566" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* グリップリング 2 */}
        <mesh position={[0, -0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.042, 0.008, 6, 12]} />
          <meshStandardMaterial color="#555566" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* エミッタ（刃の根元のリング） */}
        <mesh position={[0, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.035, 0.01, 6, 12]} />
          <meshStandardMaterial color="#aaaabb" metalness={0.9} roughness={0.15} />
        </mesh>
        {/* ポンメル（柄尻のキャップ） */}
        <mesh position={[0, -0.4, 0]}>
          <sphereGeometry args={[0.038, 8, 6]} />
          <meshStandardMaterial color="#666677" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* 刃グループ */}
        <group ref={bladeGroupRef}>
          {/* 内芯（白〜薄い色、明るく光る） */}
          <mesh position={[0, BLADE_CENTER, 0]}>
            <cylinderGeometry args={[0.025, 0.02, BLADE_LENGTH, 8]} />
            <meshBasicMaterial color={coreColor} toneMapped={false} />
          </mesh>
          {/* 先端キャップ（内芯） */}
          <mesh position={[0, BLADE_LENGTH, 0]}>
            <sphereGeometry args={[0.025, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color={coreColor} toneMapped={false} />
          </mesh>

          {/* 外グロー（半透明、AdditiveBlending） */}
          <mesh position={[0, BLADE_CENTER, 0]}>
            <cylinderGeometry args={[0.07, 0.055, BLADE_LENGTH, 8]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.42}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          {/* 先端キャップ（グロー） */}
          <mesh position={[0, BLADE_LENGTH, 0]}>
            <sphereGeometry args={[0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.34}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          {/* 大きな外側グロー（雰囲気用） */}
          <mesh position={[0, BLADE_CENTER, 0]}>
            <cylinderGeometry args={[0.16, 0.12, BLADE_LENGTH, 8]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.11}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          {/* PointLight — 刃の中央付近 */}
          <pointLight
            ref={lightRef}
            position={[0, BLADE_CENTER, 0]}
            color={bladeColor}
            intensity={3}
            distance={8}
            decay={2}
            castShadow={false}
          />
        </group>

        {/* 右腕（ボクセル風） */}
        <mesh position={[0.16, -0.42, 0.06]} rotation={[-0.1, 0.05, -0.15]}>
          <boxGeometry args={[0.15, 0.45, 0.15]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
        </mesh>
        {/* 右手 */}
        <mesh position={[0.05, -0.18, -0.02]} rotation={[0.1, 0.0, -0.05]}>
          <boxGeometry args={[0.16, 0.14, 0.14]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
        </mesh>
        {/* 左手（両手持ちの支え） */}
        <mesh position={[-0.1, -0.3, 0.02]} rotation={[0.22, 0.1, 0.18]}>
          <boxGeometry args={[0.13, 0.12, 0.13]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} />
        </mesh>
        <mesh position={[-0.22, -0.46, 0.08]} rotation={[0.08, 0.0, 0.42]}>
          <boxGeometry args={[0.13, 0.36, 0.13]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} />
        </mesh>
      </group>
    </group>
  );
}
