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
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { mobileActions } from '../utils/touchInput';
import { getMobHitbox, getMobHitboxMinY, getMobHitboxMaxY } from '../utils/mobHitboxes';
import { spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import {
  playLightsaberIgnite,
  playLightsaberSwing,
  playLightsaberHit,
  playLightsaberHum,
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
const MOB_HIT_RADIUS = 0.85;
/** プレイヤー判定 */
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;

/** コンボリセットまでの猶予（秒） */
const COMBO_RESET_TIME = 0.8;
/** アイドルハム再生間隔（秒） */
const HUM_INTERVAL = 0.9;

/** FPS表示オフセット */
const IDLE_OFFSET = new THREE.Vector3(0.4, -0.45, -0.6);
const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';

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
  /** 終了回転（Euler） */
  endEuler: [number, number, number];
  /** 開始位置オフセット（カメラ相対） */
  startOffset: [number, number, number];
  /** 終了位置オフセット（カメラ相対） */
  endOffset: [number, number, number];
}

const COMBO_STEPS: ComboStep[] = [
  {
    // Step 1: 右横斬り（右→左）
    duration: 0.25,
    damageMultiplier: 1.0,
    startEuler: [0.3, -0.5, -0.8],
    endEuler: [0.1, 1.0, 0.3],
    startOffset: [0.55, -0.3, -0.5],
    endOffset: [-0.15, -0.35, -0.65],
  },
  {
    // Step 2: 左横斬り（左→右）
    duration: 0.22,
    damageMultiplier: 1.1,
    startEuler: [0.1, 1.0, 0.3],
    endEuler: [0.2, -0.6, -0.5],
    startOffset: [-0.15, -0.35, -0.65],
    endOffset: [0.5, -0.4, -0.55],
  },
  {
    // Step 3: 斬り上げ（右下→左上）
    duration: 0.24,
    damageMultiplier: 1.2,
    startEuler: [0.6, -0.3, -1.0],
    endEuler: [-0.7, 0.4, 0.5],
    startOffset: [0.45, -0.6, -0.5],
    endOffset: [-0.1, 0.1, -0.7],
  },
  {
    // Step 4: 突き（前方突き出し）
    duration: 0.2,
    damageMultiplier: 1.3,
    startEuler: [-0.2, 0.0, 0.0],
    endEuler: [-0.1, 0.0, 0.0],
    startOffset: [0.3, -0.4, -0.5],
    endOffset: [0.2, -0.35, -1.1],
  },
  {
    // Step 5: 大振り回転斬り
    duration: 0.35,
    damageMultiplier: 1.8,
    startEuler: [0.2, -0.5, -0.3],
    endEuler: [0.2, 5.8, -0.3],
    startOffset: [0.45, -0.3, -0.55],
    endOffset: [0.45, -0.3, -0.55],
  },
];

// ============================================
// イージング
// ============================================

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
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
  const offsetWorld = useRef(new THREE.Vector3());
  const attackDir = useRef(new THREE.Vector3());
  const tempOrigin = useRef(new THREE.Vector3());
  const tempToTarget = useRef(new THREE.Vector3());
  const tempClosest = useRef(new THREE.Vector3());

  // コンボ状態
  const comboIndex = useRef(0);
  const comboTimer = useRef(0);
  const swingProgress = useRef(0); // 0=アイドル、0-1=スイング中
  const isSwinging = useRef(false);
  const lastComboTime = useRef(0);
  const hasHitThisSwing = useRef(false);
  const lightBoost = useRef(0);
  const humTimer = useRef(0);
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
      humTimer.current = 0;
    }
    wasEquipped.current = visible;

    // 非表示時はリセット
    if (!visible) {
      isSwinging.current = false;
      swingProgress.current = 0;
      comboIndex.current = 0;
    }

    // ウェポングループの表示/位置制御
    if (weaponRef.current) {
      weaponRef.current.visible = visible;
      if (!visible) return;

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
        } else if (swingProgress.current > 0.3 && swingProgress.current < 0.6 && !hasHitThisSwing.current) {
          // スイング中間でダメージ判定
          applyDamage(comboIndex.current);
        }

        // スイング中のポジション・回転を補間
        const t = easeOutQuad(swingProgress.current);
        const s = COMBO_STEPS[comboIndex.current];

        const lx = s.startOffset[0] + (s.endOffset[0] - s.startOffset[0]) * t;
        const ly = s.startOffset[1] + (s.endOffset[1] - s.startOffset[1]) * t;
        const lz = s.startOffset[2] + (s.endOffset[2] - s.startOffset[2]) * t;

        offsetWorld.current.set(lx, ly, lz).applyQuaternion(camera.quaternion);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);

        const rx = s.startEuler[0] + (s.endEuler[0] - s.startEuler[0]) * t;
        const ry = s.startEuler[1] + (s.endEuler[1] - s.startEuler[1]) * t;
        const rz = s.startEuler[2] + (s.endEuler[2] - s.startEuler[2]) * t;

        const localQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(localQuat);
      } else {
        // アイドルポジション — 右下に構える
        offsetWorld.current.copy(IDLE_OFFSET).applyQuaternion(camera.quaternion);
        weaponRef.current.position.copy(camera.position).add(offsetWorld.current);

        const idleTilt = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0.3, -0.2, -0.7, 'YXZ'),
        );
        weaponRef.current.quaternion.copy(camera.quaternion).multiply(idleTilt);
      }
    }

    // モバイルタッチ入力対応
    if (visible && mobileActions.breakBlock) {
      startSwing();
    }

    // PointLight 動的制御
    lightBoost.current = Math.max(0, lightBoost.current - dt * 8);
    if (lightRef.current && visible) {
      const baseIntensity = 3;
      const swingBoost = isSwinging.current ? 2 : 0;
      const hitFlash = lightBoost.current * 5;
      // アイドルフリッカー
      const flicker = Math.sin(performance.now() * 0.003) * 0.3
        + Math.sin(performance.now() * 0.007) * 0.15;
      lightRef.current.intensity = baseIntensity + swingBoost + hitFlash + flicker;
      lightRef.current.distance = isSwinging.current ? 12 : 8;
      lightRef.current.color.copy(bladeColorObj);
    } else if (lightRef.current) {
      lightRef.current.intensity = 0;
    }

    // アイドルハム音
    if (visible && !isSwinging.current) {
      humTimer.current += dt;
      if (humTimer.current >= HUM_INTERVAL) {
        humTimer.current = 0;
        playLightsaberHum();
      }
    }
  });

  return (
    <group>
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
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.025, 0.02, 1.2, 8]} />
            <meshBasicMaterial color={coreColor} toneMapped={false} />
          </mesh>
          {/* 先端キャップ（内芯） */}
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.025, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color={coreColor} toneMapped={false} />
          </mesh>

          {/* 外グロー（半透明、AdditiveBlending） */}
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.06, 0.05, 1.2, 8]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.35}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          {/* 先端キャップ（グロー） */}
          <mesh position={[0, 1.2, 0]}>
            <sphereGeometry args={[0.06, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.3}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          {/* 大きな外側グロー（雰囲気用） */}
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.12, 0.1, 1.2, 8]} />
            <meshBasicMaterial
              color={bladeColorObj}
              transparent
              opacity={0.08}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>

          {/* PointLight — 刃の中央付近 */}
          <pointLight
            ref={lightRef}
            position={[0, 0.6, 0]}
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
      </group>
    </group>
  );
}
