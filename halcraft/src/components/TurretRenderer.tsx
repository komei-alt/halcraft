// 固定タレット（据え置き型ガトリングガン）
// TURRETブロック上に自動射撃砲台を描画
// 射程内の敵モブを自動追尾・射撃する
// プレイヤーが近くにいる場合はプレイヤー操作モードに切り替え

import { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { BLOCK_IDS } from '../types/blocks';
import { CHUNK_SIZE } from '../types/blocks';
import { spawnDamagePopup } from '../utils/effectTriggers';

// ─── 定数 ──────────────────────────────────────────────
/** 自動射撃の射程（ブロック） */
const TURRET_RANGE = 25;
/** 発射クールダウン（秒） */
const TURRET_FIRE_COOLDOWN = 0.2;
/** 弾速（ブロック/秒） */
const BULLET_SPEED = 120;
/** 弾の最大生存時間（秒） */
const BULLET_MAX_AGE = 0.8;
/** ダメージ */
const TURRET_DAMAGE = 3;
/** モブ当たり判定半径 */
const MOB_HIT_RADIUS = 1.2;
/** 弾道の重力 */
const BULLET_GRAVITY = 2.0;
/** タレット検索間隔（秒） */
const SCAN_INTERVAL = 0.5;
/** トレイル長さ */
const TRAIL_LENGTH = 3.0;
/** インパクトパーティクル数 */
const IMPACT_PARTICLE_COUNT = 6;
/** インパクト表示時間（秒） */
const IMPACT_LIFETIME = 0.4;
/** プレイヤー操作可能距離 */
const PLAYER_CONTROL_DISTANCE = 3;

// ─── 色定義 ──────────────────────────────────────────────
const GUN_BARREL_COLOR = new THREE.Color(0x333333);
const GUN_BODY_COLOR = new THREE.Color(0x555555);
const GUN_MOUNT_COLOR = new THREE.Color(0x444444);
const BASE_COLOR = new THREE.Color(0x666666);
const TRACER_COLOR = new THREE.Color(0xffdd44);
// const TRACER_GLOW_COLOR = new THREE.Color(0xffaa22); // 将来使用
const BLOCK_IMPACT_COLOR = new THREE.Color(0xccaa66);
const MOB_HIT_COLOR = new THREE.Color(0xff3333);
const SPARK_COLOR = new THREE.Color(0xffffff);
const MUZZLE_FLASH_COLOR = new THREE.Color(0xffaa33);

// ─── 型定義 ──────────────────────────────────────────────
interface TurretProjectile {
  id: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  createdAt: number;
  prevPos: THREE.Vector3;
  dead: boolean;
}

interface TurretImpact {
  id: number;
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  type: 'block' | 'mob';
  createdAt: number;
  particles: Array<{
    vel: THREE.Vector3;
    pos: THREE.Vector3;
    size: number;
  }>;
}

interface TurretPos {
  x: number;
  y: number;
  z: number;
  key: string;
}

let nextTurretProjId = 10000;

// ────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────
export function TurretRenderer() {
  const [turretPositions, setTurretPositions] = useState<TurretPos[]>([]);
  const scanTimer = useRef(0);

  // ワールドのチャンクからTURRETブロックを定期スキャン
  useFrame((_, delta) => {
    scanTimer.current += delta;
    if (scanTimer.current < SCAN_INTERVAL) return;
    scanTimer.current = 0;

    const chunks = useWorldStore.getState().chunks;
    const found: TurretPos[] = [];

    for (const [chunkKey, data] of chunks.entries()) {
      const parts = chunkKey.split(',');
      const cx = parseInt(parts[0]) * CHUNK_SIZE;
      const cz = parseInt(parts[1]) * CHUNK_SIZE;

      for (let x = 0; x < CHUNK_SIZE; x++) {
        if (!data[x]) continue;
        for (let y = 0; y < 64; y++) {
          if (!data[x][y]) continue;
          for (let z = 0; z < CHUNK_SIZE; z++) {
            if (data[x][y][z] === BLOCK_IDS.TURRET) {
              const wx = cx + x;
              const wz = cz + z;
              const key = `${wx},${y},${wz}`;
              found.push({ x: wx + 0.5, y: y + 0.5, z: wz + 0.5, key });
            }
          }
        }
      }
    }

    setTurretPositions(found);
  });

  if (turretPositions.length === 0) return null;

  return (
    <group>
      {turretPositions.map((tp) => (
        <SingleTurret key={tp.key} position={tp} />
      ))}
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 個別タレット（自動追尾 + 射撃）
// ────────────────────────────────────────────────────────
function SingleTurret({ position }: { position: TurretPos }) {
  const pivotRef = useRef<THREE.Group>(null);
  const gunGroupRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const lastFireTime = useRef(0);
  const flashTimer = useRef(0);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0);
  const barrelRotation = useRef(0);
  const { camera } = useThree();

  const [projectiles, setProjectiles] = useState<TurretProjectile[]>([]);
  const [impacts, setImpacts] = useState<TurretImpact[]>([]);

  // マテリアル
  const barrelMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BARREL_COLOR, roughness: 0.6, metalness: 0.4,
  }), []);
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_BODY_COLOR, roughness: 0.5, metalness: 0.3,
  }), []);
  const mountMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: GUN_MOUNT_COLOR, roughness: 0.7, metalness: 0.2,
  }), []);
  const baseMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: BASE_COLOR, roughness: 0.4, metalness: 0.6,
  }), []);
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR, transparent: true, opacity: 0,
  }), []);

  // インパクト生成
  const spawnImpact = useCallback((
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    type: 'block' | 'mob',
  ) => {
    const particles: TurretImpact['particles'] = [];
    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 3,
      );
      spread.addScaledVector(normal, Math.random() * 2);
      particles.push({
        vel: spread,
        pos: pos.clone(),
        size: 0.04 + Math.random() * 0.08,
      });
    }
    setImpacts((prev) => [...prev, {
      id: nextTurretProjId++,
      pos: pos.clone(),
      normal: normal.clone(),
      type,
      createdAt: performance.now() / 1000,
      particles,
    }]);
  }, []);

  // メインループ
  useFrame((_, delta) => {
    const now = performance.now() / 1000;
    const mobs = useMobStore.getState().mobs;
    const getBlock = useWorldStore.getState().getBlock;
    const turretPos = new THREE.Vector3(position.x, position.y, position.z);

    // プレイヤーがタレットの近くにいるか判定（プレイヤー操作モード）
    const camPos = camera.position;
    const distToPlayer = turretPos.distanceTo(camPos);
    const isPlayerControlled = distToPlayer < PLAYER_CONTROL_DISTANCE && !!document.pointerLockElement;

    // --- ターゲット検索（敵モブのみ） ---
    let targetDir: THREE.Vector3 | null = null;

    if (isPlayerControlled) {
      // プレイヤー操作: カメラの向きに従う
      targetDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    } else {
      // 自動モード: 最も近い敵モブを追尾
      let closestDist = TURRET_RANGE;
      let closestMob: { x: number; y: number; z: number } | null = null;

      for (const mob of mobs) {
        if (mob.hp <= 0) continue;
        // 敵のみ対象（ゾンビ、クモ）
        if (mob.type !== 'zombie' && mob.type !== 'spider') continue;
        // 怒り状態の味方も除外しない（味方は追わない）

        const mobPos = new THREE.Vector3(mob.x, mob.y + 0.8, mob.z);
        const dist = turretPos.distanceTo(mobPos);
        if (dist < closestDist) {
          closestDist = dist;
          closestMob = { x: mob.x, y: mob.y + 0.8, z: mob.z };
        }
      }

      if (closestMob) {
        targetDir = new THREE.Vector3(
          closestMob.x - turretPos.x,
          closestMob.y - turretPos.y,
          closestMob.z - turretPos.z,
        ).normalize();
      }
    }

    // --- 銃の回転 ---
    if (pivotRef.current && targetDir) {
      const targetYaw = Math.atan2(targetDir.x, targetDir.z);
      const hDist = Math.sqrt(targetDir.x ** 2 + targetDir.z ** 2);
      const targetPitch = -Math.atan2(targetDir.y, hDist);

      const lerpSpeed = 8 * delta;
      currentYaw.current += (targetYaw - currentYaw.current) * Math.min(1, lerpSpeed);
      currentPitch.current += (targetPitch - currentPitch.current) * Math.min(1, lerpSpeed);
      pivotRef.current.rotation.set(currentPitch.current, currentYaw.current, 0);
    }

    // --- 射撃 ---
    const canFire = now - lastFireTime.current > TURRET_FIRE_COOLDOWN;
    const shouldFire = isPlayerControlled
      ? canFire  // プレイヤー操作時は常に発射（マウスボタン判定は別途）
      : (canFire && targetDir !== null);

    if (shouldFire && targetDir && gunGroupRef.current) {
      lastFireTime.current = now;

      // マズル位置を算出
      gunGroupRef.current.updateWorldMatrix(true, false);
      const muzzleLocal = new THREE.Vector3(0, 0, 0.85);
      const muzzleWorld = muzzleLocal.applyMatrix4(gunGroupRef.current.matrixWorld);

      // 散布を追加
      const spread = 0.025;
      const dir = targetDir.clone();
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;
      dir.normalize();

      const vel = dir.multiplyScalar(BULLET_SPEED);
      setProjectiles((prev) => [...prev, {
        id: nextTurretProjId++,
        pos: muzzleWorld.clone(),
        vel,
        createdAt: now,
        prevPos: muzzleWorld.clone(),
        dead: false,
      }]);

      // マズルフラッシュ + バレル回転
      flashTimer.current = 0.06;
      barrelRotation.current += Math.PI / 3; // 回転式バレル
    }

    // --- マズルフラッシュ減衰 ---
    if (flashTimer.current > 0) {
      flashTimer.current -= delta;
      if (flashRef.current) {
        const mat = flashRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = flashTimer.current > 0 ? 1 : 0;
      }
    }

    // --- 弾丸更新 ---
    setProjectiles((prev) => {
      const alive: TurretProjectile[] = [];
      for (const proj of prev) {
        if (proj.dead) continue;
        const age = now - proj.createdAt;
        if (age > BULLET_MAX_AGE) continue;

        proj.prevPos.copy(proj.pos);
        proj.vel.y -= BULLET_GRAVITY * delta;

        const moveDir = proj.vel.clone().normalize();
        const moveDist = BULLET_SPEED * delta;
        const steps = Math.max(1, Math.ceil(moveDist / 0.5));
        const stepSize = moveDist / steps;
        let hit = false;

        for (let s = 0; s < steps; s++) {
          proj.pos.addScaledVector(moveDir, stepSize);

          // ブロック衝突
          const bx = Math.floor(proj.pos.x);
          const by = Math.floor(proj.pos.y);
          const bz = Math.floor(proj.pos.z);
          const blockId = getBlock(bx, by, bz);
          if (blockId !== BLOCK_IDS.AIR && blockId !== BLOCK_IDS.TURRET) {
            spawnImpact(proj.pos.clone(), moveDir.clone().negate().normalize(), 'block');
            proj.dead = true;
            hit = true;
            break;
          }

          // モブ衝突
          for (const mob of mobs) {
            if (mob.hp <= 0) continue;
            const mobCenter = new THREE.Vector3(mob.x, mob.y + 0.8, mob.z);
            const dist = proj.pos.distanceTo(mobCenter);
            if (dist < MOB_HIT_RADIUS) {
              spawnImpact(proj.pos.clone(), proj.pos.clone().sub(mobCenter).normalize(), 'mob');
              useMobStore.getState().damageMob(mob.id, TURRET_DAMAGE, moveDir.x, moveDir.z);
              const sendMobDamage = useMultiplayerStore.getState().sendMobDamage;
              sendMobDamage(mob.id, TURRET_DAMAGE, moveDir.x * 3, moveDir.z * 3);
              spawnDamagePopup(TURRET_DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
              proj.dead = true;
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (!proj.dead) alive.push(proj);
      }
      return alive;
    });

    // --- インパクトエフェクト期限切れ除去 ---
    setImpacts((prev) => {
      const filtered = prev.filter((e) => now - e.createdAt < IMPACT_LIFETIME);
      if (filtered.length === prev.length) return prev;
      return filtered;
    });
  });

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* === 台座（ブロックの上に乗る鉄の台） === */}
      <mesh material={baseMat} position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.35, 0.45, 0.3, 8]} />
      </mesh>
      {/* 支柱 */}
      <mesh material={mountMat} position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.3, 6]} />
      </mesh>

      {/* === 旋回部分 === */}
      <group ref={pivotRef} position={[0, 0.25, 0]}>
        <group ref={gunGroupRef}>
          {/* 旋回台座 */}
          <mesh material={mountMat} position={[0, 0, 0]}>
            <boxGeometry args={[0.22, 0.14, 0.22]} />
          </mesh>
          {/* 銃本体 */}
          <mesh material={bodyMat} position={[0, 0.0, 0.22]}>
            <boxGeometry args={[0.15, 0.12, 0.35]} />
          </mesh>
          {/* 回転式バレル（3本） */}
          <group position={[0, 0, 0.55]} rotation={[0, 0, barrelRotation.current]}>
            <mesh material={barrelMat} position={[0.04, 0, 0]}>
              <boxGeometry args={[0.05, 0.05, 0.5]} />
            </mesh>
            <mesh material={barrelMat} position={[-0.04, 0.04, 0]}>
              <boxGeometry args={[0.05, 0.05, 0.5]} />
            </mesh>
            <mesh material={barrelMat} position={[-0.04, -0.04, 0]}>
              <boxGeometry args={[0.05, 0.05, 0.5]} />
            </mesh>
          </group>
          {/* 銃身先端 */}
          <mesh material={barrelMat} position={[0, 0.0, 0.82]}>
            <boxGeometry args={[0.12, 0.12, 0.06]} />
          </mesh>
          {/* 弾薬ボックス */}
          <mesh material={bodyMat} position={[0, -0.14, 0.1]}>
            <boxGeometry args={[0.14, 0.12, 0.2]} />
          </mesh>
          {/* マズルフラッシュ */}
          <mesh ref={flashRef} position={[0, 0, 0.9]} material={flashMat.clone()}>
            <boxGeometry args={[0.25, 0.25, 0.15]} />
          </mesh>
        </group>
      </group>

      {/* === インジケーターライト（稼働中） === */}
      <pointLight
        position={[0, 0.4, 0]}
        color={0xff4444}
        intensity={0.5}
        distance={3}
      />

      {/* === 弾丸トレイル === */}
      {projectiles.map((proj) => (
        <TurretTrail key={proj.id} projectile={proj} />
      ))}

      {/* === インパクトエフェクト === */}
      {impacts.map((effect) => (
        <TurretImpactEffect key={effect.id} effect={effect} />
      ))}
    </group>
  );
}

// ────────────────────────────────────────────────────────
// 弾丸トレイル
// ────────────────────────────────────────────────────────
function TurretTrail({ projectile }: { projectile: TurretProjectile }) {
  const bulletRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!bulletRef.current) return;
    bulletRef.current.position.copy(projectile.pos);

    if (trailRef.current) {
      const dir = projectile.pos.clone().sub(projectile.prevPos);
      const len = Math.min(dir.length(), TRAIL_LENGTH);
      if (len > 0.1) {
        const mid = projectile.prevPos.clone().add(projectile.pos).multiplyScalar(0.5);
        const up = new THREE.Vector3(0, 1, 0);
        const dirN = dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(up, dirN);
        trailRef.current.position.copy(mid);
        trailRef.current.quaternion.copy(q);
        trailRef.current.scale.set(1, len, 1);
        trailRef.current.visible = true;
      }
    }
  });

  return (
    <group>
      <mesh ref={bulletRef}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshBasicMaterial color={SPARK_COLOR} transparent opacity={0.9} />
      </mesh>
      <mesh ref={trailRef} visible={false}>
        <cylinderGeometry args={[0.06, 0.02, 1, 4]} />
        <meshBasicMaterial color={TRACER_COLOR} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// インパクトエフェクト
// ────────────────────────────────────────────────────────
function TurretImpactEffect({ effect }: { effect: TurretImpact }) {
  const particlesRef = useRef<THREE.Mesh[]>([]);

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - effect.createdAt;
    const progress = age / IMPACT_LIFETIME;
    if (progress >= 1) return;

    const dt = 1 / 60;
    for (let i = 0; i < effect.particles.length; i++) {
      const p = effect.particles[i];
      p.vel.y -= 10 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += p.vel.z * dt;
      p.vel.multiplyScalar(0.95);

      const mesh = particlesRef.current[i];
      if (mesh) {
        mesh.position.copy(p.pos);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - progress * 1.5);
      }
    }
  });

  const mainColor = effect.type === 'block' ? BLOCK_IMPACT_COLOR : MOB_HIT_COLOR;

  return (
    <group>
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
    </group>
  );
}
