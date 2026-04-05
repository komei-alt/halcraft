// 機関銃コンポーネント
// ヘリコプターの左右に搭載されるボクセル風の機関銃
// ガンナー席のプレイヤーが左クリックで発射
// 弾丸は物理計算で飛翔し、ブロックやモブへの衝突エフェクトを表示
//
// 弾道システム:
//   1. マズル位置から弾丸（プロジェクタイル）を発射
//   2. 毎フレーム弾丸を高速移動させながらレイマーチングでブロック衝突判定
//   3. モブとの球体交差判定を同時実行
//   4. 衝突時にインパクトエフェクト（パーティクル）を生成
//   5. 弾道は光る3D円柱トレイルで尾を引く表現

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVehicleStore, GUN_CONSTANTS } from '../../stores/useVehicleStore';
import { useMobStore } from '../../stores/useMobStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { BLOCK_IDS } from '../../types/blocks';
import { spawnDamagePopup } from '../../utils/effectTriggers';

// ─── 定数 ──────────────────────────────────────────────
/** 弾速（ブロック/秒） */
const BULLET_SPEED = 120;
/** 弾の最大生存時間（秒） */
const BULLET_MAX_AGE = 1.0;
/** トレイル（残光）の長さ（ブロック） */
const TRAIL_LENGTH = 3.5;
/** 弾のヒット半径（モブ当たり判定） */
const MOB_HIT_RADIUS = 1.2;
/** インパクトパーティクルの数 */
const IMPACT_PARTICLE_COUNT = 8;
/** インパクトパーティクルの表示時間（秒） */
const IMPACT_LIFETIME = 0.5;
/** ヒットフラッシュの表示時間（秒） */
const HIT_FLASH_LIFETIME = 0.15;
/** 重力（弾道にわずかな落下を加える） */
const BULLET_GRAVITY = 3.0;

// ─── 色定義 ──────────────────────────────────────────
const GUN_BARREL_COLOR = new THREE.Color(0x333333);
const GUN_BODY_COLOR = new THREE.Color(0x555555);
const GUN_MOUNT_COLOR = new THREE.Color(0x444444);
const MUZZLE_FLASH_COLOR = new THREE.Color(0xffaa33);
const TRACER_COLOR = new THREE.Color(0xffdd44);
const TRACER_GLOW_COLOR = new THREE.Color(0xffaa22);
const BLOCK_IMPACT_COLOR = new THREE.Color(0xccaa66);   // ブロック衝突: 土粒子の色
const MOB_HIT_COLOR = new THREE.Color(0xff3333);        // モブ衝突: 赤い血しぶき
const SPARK_COLOR = new THREE.Color(0xffffff);           // 白い火花

// ─── 型定義 ──────────────────────────────────────────
/** 飛翔中の弾丸 */
interface Projectile {
  id: number;
  /** 現在位置 */
  pos: THREE.Vector3;
  /** 速度ベクトル */
  vel: THREE.Vector3;
  /** 発射時刻 */
  createdAt: number;
  /** 前フレームの位置（トレイル描画用） */
  prevPositions: THREE.Vector3[];
  /** 発射元の銃の位置（マズルフラッシュ用） */
  side: 'left' | 'right';
  /** 弾が衝突して消滅済みか */
  dead: boolean;
}

/** 衝突エフェクト */
interface ImpactEffect {
  id: number;
  /** 衝突位置 */
  pos: THREE.Vector3;
  /** 衝突面の法線ベクトル（パーティクルの飛散方向） */
  normal: THREE.Vector3;
  /** 衝突種別 */
  type: 'block' | 'mob';
  /** 生成時刻 */
  createdAt: number;
  /** パーティクルの初速度（各粒子ごと） */
  particles: Array<{
    vel: THREE.Vector3;
    pos: THREE.Vector3;
    size: number;
  }>;
}

let nextId = 0;

// ────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────
export function MachineGun() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const mySeat = helicopter.mySeat;
  const { camera } = useThree();

  // 発射クールダウン
  const lastFireTime = useRef(0);
  const isMouseDown = useRef(false);

  // マズルフラッシュ
  const flashLeftRef = useRef<THREE.Mesh>(null);
  const flashRightRef = useRef<THREE.Mesh>(null);
  const flashTimerLeft = useRef(0);
  const flashTimerRight = useRef(0);

  // 弾丸（プロジェクタイル）とエフェクト
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [impacts, setImpacts] = useState<ImpactEffect[]>([]);

  // 射撃方向のワーク用ベクトル
  const shootDir = useRef(new THREE.Vector3());

  // マテリアル（メモ化）
  const barrelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BARREL_COLOR, roughness: 0.6, metalness: 0.4,
  }), []);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BODY_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const mountMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_MOUNT_COLOR, roughness: 0.7, metalness: 0.2,
  }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR, transparent: true, opacity: 0,
  }), []);

  // ─── 射撃処理 ─────────────────────────────────────
  const fireGun = useCallback((side: 'left' | 'right') => {
    const now = performance.now() / 1000;
    if (now - lastFireTime.current < GUN_CONSTANTS.FIRE_COOLDOWN) return;
    lastFireTime.current = now;

    // 照準方向 = カメラの前方
    shootDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);

    // 弾の初期位置 = カメラ位置（ガンナー視点から発射）
    const startPos = camera.position.clone();

    // わずかなランダム散布（リアリティ向上）
    const spread = 0.015;
    shootDir.current.x += (Math.random() - 0.5) * spread;
    shootDir.current.y += (Math.random() - 0.5) * spread;
    shootDir.current.z += (Math.random() - 0.5) * spread;
    shootDir.current.normalize();

    // 弾丸を生成
    const vel = shootDir.current.clone().multiplyScalar(BULLET_SPEED);
    const projectile: Projectile = {
      id: nextId++,
      pos: startPos,
      vel,
      createdAt: now,
      prevPositions: [startPos.clone()],
      side,
      dead: false,
    };

    setProjectiles((prev) => [...prev, projectile]);

    // マズルフラッシュ
    if (side === 'left') {
      flashTimerLeft.current = 0.08;
    } else {
      flashTimerRight.current = 0.08;
    }
  }, [camera]);

  // ─── マウスイベント ───────────────────────────────
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) isMouseDown.current = false;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  // ─── インパクトエフェクト生成ヘルパー ─────────────
  const spawnImpact = useCallback((
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    type: 'block' | 'mob',
  ) => {
    const particles: ImpactEffect['particles'] = [];
    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      // 法線方向を中心にランダムに飛散
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4,
      );
      // 法線方向に追加バイアス
      spread.addScaledVector(normal, Math.random() * 3);
      particles.push({
        vel: spread,
        pos: pos.clone(),
        size: 0.05 + Math.random() * 0.1,
      });
    }
    const effect: ImpactEffect = {
      id: nextId++,
      pos: pos.clone(),
      normal: normal.clone(),
      type,
      createdAt: performance.now() / 1000,
      particles,
    };
    setImpacts((prev) => [...prev, effect]);
  }, []);

  // ─── フレーム更新 ─────────────────────────────────
  useFrame((_, delta) => {
    const now = performance.now() / 1000;
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;

    // マズルフラッシュ減衰
    if (flashTimerLeft.current > 0) {
      flashTimerLeft.current -= delta;
      if (flashLeftRef.current) {
        const mat = flashLeftRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = flashTimerLeft.current > 0 ? 1 : 0;
      }
    }
    if (flashTimerRight.current > 0) {
      flashTimerRight.current -= delta;
      if (flashRightRef.current) {
        const mat = flashRightRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = flashTimerRight.current > 0 ? 1 : 0;
      }
    }

    // 弾丸の物理更新
    setProjectiles((prev) => {
      const alive: Projectile[] = [];
      for (const proj of prev) {
        if (proj.dead) { continue; }
        const age = now - proj.createdAt;
        if (age > BULLET_MAX_AGE) { continue; }

        // 前フレームの位置を記録（トレイル用、最大6点を保持）
        proj.prevPositions.push(proj.pos.clone());
        if (proj.prevPositions.length > 6) proj.prevPositions.shift();

        // 重力を適用
        proj.vel.y -= BULLET_GRAVITY * delta;

        // 移動量算出（フレームレート非依存）
        const moveDir = proj.vel.clone().normalize();
        const moveDist = BULLET_SPEED * delta;
        const steps = Math.max(1, Math.ceil(moveDist / 0.5)); // 0.5ブロック刻みでチェック
        const stepSize = moveDist / steps;

        let hitSomething = false;

        for (let s = 0; s < steps; s++) {
          // 段階的に位置を更新
          proj.pos.addScaledVector(moveDir, stepSize);

          // --- ブロック衝突判定（レイマーチング） ---
          const bx = Math.floor(proj.pos.x);
          const by = Math.floor(proj.pos.y);
          const bz = Math.floor(proj.pos.z);

          const blockId = getBlock(bx, by, bz);
          if (blockId !== BLOCK_IDS.AIR) {
            // 衝突面の法線を推定（弾の進入方向の逆）
            const normal = moveDir.clone().negate().normalize();
            // 衝突位置をブロック表面に補正
            const hitPos = proj.pos.clone();
            spawnImpact(hitPos, normal, 'block');
            proj.dead = true;
            hitSomething = true;
            break;
          }

          // --- モブ衝突判定 ---
          for (const mob of mobs) {
            if (mob.hp <= 0) continue;
            const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.8, mob.z);
            const dist = proj.pos.distanceTo(mobCenter);

            if (dist < MOB_HIT_RADIUS) {
              // ヒット！
              const normal = proj.pos.clone().sub(mobCenter).normalize();
              spawnImpact(proj.pos.clone(), normal, 'mob');

              // ダメージ適用
              const sendMobDamage = useMultiplayerStore.getState().sendMobDamage;
              sendMobDamage(mob.id, GUN_CONSTANTS.DAMAGE, moveDir.x * 3, moveDir.z * 3);
              useMobStore.getState().damageMob(mob.id, GUN_CONSTANTS.DAMAGE, moveDir.x, moveDir.z);

              // ダメージポップアップ
              spawnDamagePopup(GUN_CONSTANTS.DAMAGE, mob.x, mob.y + 1.0, mob.z, false);

              proj.dead = true;
              hitSomething = true;
              break;
            }
          }

          if (hitSomething) break;
        }

        // 生存中の弾丸のみ保持
        if (!proj.dead) {
          alive.push(proj);
        }
      }

      // 変更が無ければ同じ参照を返す（不要な再レンダリング防止）
      // ただしprevPositionsの更新があるので毎フレーム新しい配列にしたほうが良い
      return alive;
    });

    // インパクトエフェクト期限切れ除去
    setImpacts((prev) => {
      const filtered = prev.filter((e) => now - e.createdAt < IMPACT_LIFETIME);
      if (filtered.length === prev.length) return prev;
      return filtered;
    });

    // ガンナー席の射撃（左クリック長押し対応）
    const isGunner = mySeat === 'gunner_left' || mySeat === 'gunner_right';
    const hasPointerLock = !!document.pointerLockElement;
    if (isGunner && isMouseDown.current && hasPointerLock) {
      fireGun(mySeat === 'gunner_left' ? 'left' : 'right');
    }
  });

  if (!helicopter.spawned) return null;

  return (
    <group>
      {/* === 左機関銃モデル === */}
      <GunModel
        side="left"
        flashRef={flashLeftRef}
        barrelMat={barrelMat}
        bodyMat={bodyMat}
        mountMat={mountMat}
        flashMat={flashMat}
      />
      {/* === 右機関銃モデル === */}
      <GunModel
        side="right"
        flashRef={flashRightRef}
        barrelMat={barrelMat}
        bodyMat={bodyMat}
        mountMat={mountMat}
        flashMat={flashMat}
      />
      {/* === 飛翔中の弾丸 + トレイル === */}
      {projectiles.map((proj) => (
        <ProjectileTrail key={proj.id} projectile={proj} />
      ))}
      {/* === 衝突エフェクト（パーティクル） === */}
      {impacts.map((effect) => (
        <ImpactParticles key={effect.id} effect={effect} />
      ))}
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 機関銃3Dモデル（ボクセルスタイル）
// ────────────────────────────────────────────────────────
function GunModel({
  side,
  flashRef,
  barrelMat,
  bodyMat,
  mountMat,
  flashMat,
}: {
  side: 'left' | 'right';
  flashRef: React.RefObject<THREE.Mesh | null>;
  barrelMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  mountMat: THREE.MeshStandardMaterial;
  flashMat: THREE.MeshBasicMaterial;
}) {
  const xOffset = side === 'left' ? -1.0 : 1.0;
  const helicopter = useVehicleStore((s) => s.helicopter);

  if (!helicopter.spawned) return null;

  return (
    <group
      position={[helicopter.x, helicopter.y, helicopter.z]}
      rotation={[helicopter.pitch, helicopter.rotationY, helicopter.roll]}
      scale={1.3}
    >
      <group rotation={[0, Math.PI, 0]}>
        <group position={[xOffset, 0.0, 0.4]}>
          {/* マウント */}
          <mesh material={mountMat}>
            <boxGeometry args={[0.2, 0.15, 0.2]} />
          </mesh>
          {/* 銃本体 */}
          <mesh position={[0, -0.1, 0.2]} material={bodyMat}>
            <boxGeometry args={[0.15, 0.12, 0.35]} />
          </mesh>
          {/* 銃身 */}
          <mesh position={[0, -0.1, 0.55]} material={barrelMat}>
            <boxGeometry args={[0.08, 0.08, 0.5]} />
          </mesh>
          {/* 銃身先端 */}
          <mesh position={[0, -0.1, 0.82]} material={barrelMat}>
            <boxGeometry args={[0.1, 0.1, 0.06]} />
          </mesh>
          {/* 弾薬ボックス */}
          <mesh position={[0, -0.22, 0.15]} material={bodyMat}>
            <boxGeometry args={[0.12, 0.1, 0.18]} />
          </mesh>
          {/* マズルフラッシュ */}
          <mesh ref={flashRef} position={[0, -0.1, 0.9]} material={flashMat.clone()}>
            <boxGeometry args={[0.2, 0.2, 0.15]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 弾丸 + トレイル描画
// ────────────────────────────────────────────────────────
function ProjectileTrail({ projectile }: { projectile: Projectile }) {
  const groupRef = useRef<THREE.Group>(null);
  const bulletRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!groupRef.current || !bulletRef.current) return;

    // 弾頭の位置を更新
    bulletRef.current.position.copy(projectile.pos);

    // トレイル（弾の尾）を計算
    if (trailRef.current && projectile.prevPositions.length >= 2) {
      const tailPos = projectile.prevPositions[0];
      const headPos = projectile.pos;
      const dir = headPos.clone().sub(tailPos);
      const len = Math.min(dir.length(), TRAIL_LENGTH);

      if (len > 0.1) {
        const mid = tailPos.clone().add(headPos).multiplyScalar(0.5);
        trailRef.current.position.copy(mid);

        // Y軸 → 弾道方向へ回転
        const up = new THREE.Vector3(0, 1, 0);
        const dirNorm = dir.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);
        trailRef.current.quaternion.copy(quat);
        trailRef.current.scale.set(1, len, 1);
        trailRef.current.visible = true;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* 弾頭（明るい光る球） */}
      <mesh ref={bulletRef}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshBasicMaterial color={SPARK_COLOR} transparent opacity={0.95} />
      </mesh>
      {/* 弾頭のグロー */}
      <mesh position={projectile.pos.clone()}>
        <sphereGeometry args={[0.25, 6, 6]} />
        <meshBasicMaterial color={TRACER_COLOR} transparent opacity={0.4} />
      </mesh>
      {/* トレイル（弾の尾） */}
      <mesh ref={trailRef} visible={false}>
        <cylinderGeometry args={[0.06, 0.02, 1, 4]} />
        <meshBasicMaterial color={TRACER_GLOW_COLOR} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 衝突エフェクト（パーティクル散乱）
// ────────────────────────────────────────────────────────
function ImpactParticles({ effect }: { effect: ImpactEffect }) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Mesh[]>([]);
  // ヒットフラッシュ
  const flashRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - effect.createdAt;
    const progress = age / IMPACT_LIFETIME;
    if (progress >= 1) return;

    // パーティクルの物理更新
    const dt = 1 / 60; // 固定ステップ
    for (let i = 0; i < effect.particles.length; i++) {
      const p = effect.particles[i];
      // 重力
      p.vel.y -= 12 * dt;
      // 位置更新
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      // 速度減衰
      p.vel.multiplyScalar(0.96);

      // メッシュに反映
      const mesh = particlesRef.current[i];
      if (mesh) {
        mesh.position.copy(p.pos);
        // フェードアウト
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - progress * 1.5);
        // 縮小
        const s = p.size * Math.max(0.2, 1 - progress);
        mesh.scale.setScalar(s / p.size);
      }
    }

    // ヒットフラッシュ
    if (flashRef.current) {
      const flashProgress = age / HIT_FLASH_LIFETIME;
      if (flashProgress < 1) {
        flashRef.current.visible = true;
        const flashScale = 0.3 + flashProgress * 0.5;
        flashRef.current.scale.setScalar(flashScale);
        const mat = flashRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - flashProgress);
      } else {
        flashRef.current.visible = false;
      }
    }
  });

  const isBlock = effect.type === 'block';
  const mainColor = isBlock ? BLOCK_IMPACT_COLOR : MOB_HIT_COLOR;

  return (
    <group ref={groupRef}>
      {/* ヒットフラッシュ（着弾時の一瞬の光） */}
      <mesh ref={flashRef} position={effect.pos.clone()}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial
          color={isBlock ? 0xffddaa : 0xff6633}
          transparent
          opacity={1}
        />
      </mesh>

      {/* パーティクル群 */}
      {effect.particles.map((p, i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) particlesRef.current[i] = el; }}
          position={p.pos.clone()}
        >
          <boxGeometry args={[p.size, p.size, p.size]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? SPARK_COLOR : mainColor}
            transparent
            opacity={1}
          />
        </mesh>
      ))}

      {/* ブロック衝突: 追加の破片（大きめの四角形パーティクル） */}
      {isBlock && (
        <>
          <mesh position={effect.pos.clone()}>
            <boxGeometry args={[0.15, 0.15, 0.15]} />
            <meshBasicMaterial color={0x886633} transparent opacity={0.8} />
          </mesh>
          <mesh position={[effect.pos.x + 0.1, effect.pos.y + 0.05, effect.pos.z - 0.1]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial color={0x997744} transparent opacity={0.6} />
          </mesh>
        </>
      )}

      {/* モブ衝突: ヒットマーカー（赤いX） */}
      {!isBlock && (
        <group position={effect.pos.clone()}>
          {/* 横棒 */}
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} />
          </mesh>
          {/* 縦棒 */}
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color={0xff0000} transparent opacity={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}
