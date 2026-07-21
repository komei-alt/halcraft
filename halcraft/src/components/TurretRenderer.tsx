// 固定タレット（据え置き型ガトリングガン）
// TURRETブロック上に自動射撃砲台を描画
// 射程内の敵モブを自動追尾・射撃する
// プレイヤーが近くにいる場合はプレイヤー操作モードに切り替え

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { BLOCK_IDS } from '../types/blocks';
import { spawnDamagePopup } from '../utils/effectTriggers';
import { rayMarchProjectile } from '../utils/projectilePhysics';
import { playMachineGunSound, playBulletImpactSound } from '../utils/sounds';

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
const ARMOR_COLOR = new THREE.Color(0x7a808b);
const AMMO_COLOR = new THREE.Color(0x756148);
const ACCENT_COLOR = new THREE.Color(0xff5858);
const SENSOR_COLOR = new THREE.Color(0x7fe6ff);
const TRACER_COLOR = new THREE.Color(0xffdd44);
// const TRACER_GLOW_COLOR = new THREE.Color(0xffaa22); // 将来使用
const BLOCK_IMPACT_COLOR = new THREE.Color(0xccaa66);
const MOB_HIT_COLOR = new THREE.Color(0xff3333);
const SPARK_COLOR = new THREE.Color(0xffffff);
const MUZZLE_FLASH_COLOR = new THREE.Color(0xffaa33);

type Vector3Tuple = [number, number, number];

interface TurretBoxPart {
  position: Vector3Tuple;
  size: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface TurretCylinderPart {
  position: Vector3Tuple;
  radiusTop: number;
  radiusBottom: number;
  height: number;
  rotation?: Vector3Tuple;
  radialSegments?: number;
}

const ZERO_ROTATION: Vector3Tuple = [0, 0, 0];

function transformTurretGeometry(
  geometry: THREE.BufferGeometry,
  position: Vector3Tuple,
  rotation: Vector3Tuple = ZERO_ROTATION,
): THREE.BufferGeometry {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

function mergeTurretGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function createTurretBoxGeometry(parts: TurretBoxPart[]): THREE.BufferGeometry {
  return mergeTurretGeometries(parts.map((part) => transformTurretGeometry(
    new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]),
    part.position,
    part.rotation,
  )));
}

function createTurretCylinderGeometry(parts: TurretCylinderPart[]): THREE.BufferGeometry {
  return mergeTurretGeometries(parts.map((part) => transformTurretGeometry(
    new THREE.CylinderGeometry(
      part.radiusTop,
      part.radiusBottom,
      part.height,
      part.radialSegments ?? 10,
    ),
    part.position,
    part.rotation,
  )));
}

/** 地面へ荷重を分散する多角形ベースとアウトリガー。 */
const TURRET_BASE_GEOMETRY = mergeTurretGeometries([
  createTurretCylinderGeometry([
    { position: [0, -0.21, 0], radiusTop: 0.48, radiusBottom: 0.55, height: 0.2, radialSegments: 12 },
    { position: [0, -0.075, 0], radiusTop: 0.35, radiusBottom: 0.42, height: 0.1, radialSegments: 12 },
  ]),
  createTurretBoxGeometry([
    { position: [0.39, -0.25, 0], size: [0.3, 0.08, 0.16] },
    { position: [-0.39, -0.25, 0], size: [0.3, 0.08, 0.16] },
    { position: [0, -0.25, 0.39], size: [0.16, 0.08, 0.3] },
    { position: [0, -0.25, -0.39], size: [0.16, 0.08, 0.3] },
  ]),
]);

/** 旋回リング、支柱、斜めブレースを1材質に統合した架台。 */
const TURRET_PEDESTAL_GEOMETRY = mergeTurretGeometries([
  createTurretCylinderGeometry([
    { position: [0, 0.02, 0], radiusTop: 0.13, radiusBottom: 0.17, height: 0.28, radialSegments: 10 },
    { position: [0, 0.17, 0], radiusTop: 0.25, radiusBottom: 0.25, height: 0.08, radialSegments: 12 },
  ]),
  createTurretBoxGeometry([
    { position: [0.17, 0.025, 0], size: [0.055, 0.28, 0.07], rotation: [0, 0, 0.48] },
    { position: [-0.17, 0.025, 0], size: [0.055, 0.28, 0.07], rotation: [0, 0, -0.48] },
    { position: [0, 0.025, 0.17], size: [0.07, 0.28, 0.055], rotation: [0.48, 0, 0] },
    { position: [0, 0.025, -0.17], size: [0.07, 0.28, 0.055], rotation: [-0.48, 0, 0] },
  ]),
]);

const TURRET_ACCENT_GEOMETRY = createTurretBoxGeometry([
  { position: [0, -0.065, -0.43], size: [0.28, 0.045, 0.035] },
  { position: [0.25, -0.16, -0.39], size: [0.045, 0.13, 0.035] },
  { position: [-0.25, -0.16, -0.39], size: [0.045, 0.13, 0.035] },
]);

/** トラニオン軸と反動受けを含む、可動ヘッドの骨格。 */
const TURRET_HEAD_MOUNT_GEOMETRY = mergeTurretGeometries([
  createTurretBoxGeometry([
    { position: [0, 0, 0.03], size: [0.34, 0.17, 0.3] },
    { position: [-0.19, 0, 0.2], size: [0.055, 0.22, 0.24], rotation: [0, 0, -0.08] },
    { position: [0.19, 0, 0.2], size: [0.055, 0.22, 0.24], rotation: [0, 0, 0.08] },
  ]),
  createTurretCylinderGeometry([
    { position: [0, 0.01, 0.17], radiusTop: 0.085, radiusBottom: 0.085, height: 0.45, rotation: [0, 0, Math.PI / 2], radialSegments: 12 },
  ]),
]);

/** 前面を絞った装甲板と左右の防盾。 */
const TURRET_ARMOR_GEOMETRY = createTurretBoxGeometry([
  { position: [0, 0.115, 0.055], size: [0.3, 0.09, 0.22], rotation: [-0.08, 0, 0] },
  { position: [-0.155, 0.065, 0.3], size: [0.075, 0.24, 0.35], rotation: [0, -0.09, -0.05] },
  { position: [0.155, 0.065, 0.3], size: [0.075, 0.24, 0.35], rotation: [0, 0.09, 0.05] },
  { position: [0, 0.11, 0.39], size: [0.2, 0.075, 0.2], rotation: [-0.05, 0, 0] },
]);

const TURRET_RECEIVER_GEOMETRY = createTurretBoxGeometry([
  { position: [0, 0.01, 0.27], size: [0.22, 0.19, 0.42] },
  { position: [0, 0.02, 0.5], size: [0.19, 0.18, 0.12] },
  { position: [0, 0.145, 0.24], size: [0.16, 0.06, 0.24], rotation: [-0.05, 0, 0] },
  { position: [0.11, 0.205, 0.27], size: [0.11, 0.09, 0.17] },
]);

/** 側面弾薬箱から薬室へつながる段階的な給弾シュート。 */
const TURRET_AMMO_GEOMETRY = createTurretBoxGeometry([
  { position: [-0.24, -0.065, 0.12], size: [0.19, 0.21, 0.27] },
  { position: [-0.185, -0.02, 0.31], size: [0.09, 0.1, 0.12], rotation: [0.14, 0, 0] },
  { position: [-0.135, 0.005, 0.41], size: [0.075, 0.085, 0.1], rotation: [0.1, 0, 0] },
]);

const TURRET_SENSOR_GEOMETRY = createTurretCylinderGeometry([
  { position: [0.11, 0.205, 0.365], radiusTop: 0.04, radiusBottom: 0.04, height: 0.018, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
]);

/** 四連銃身、基部カラー、銃口カラーを1メッシュで回転させる。 */
const TURRET_BARREL_GEOMETRY = createTurretCylinderGeometry([
  { position: [0.06, 0, 0.3], radiusTop: 0.021, radiusBottom: 0.024, height: 0.6, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
  { position: [-0.06, 0, 0.3], radiusTop: 0.021, radiusBottom: 0.024, height: 0.6, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
  { position: [0, 0.06, 0.3], radiusTop: 0.021, radiusBottom: 0.024, height: 0.6, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
  { position: [0, -0.06, 0.3], radiusTop: 0.021, radiusBottom: 0.024, height: 0.6, rotation: [Math.PI / 2, 0, 0], radialSegments: 8 },
  { position: [0, 0, 0.045], radiusTop: 0.11, radiusBottom: 0.11, height: 0.09, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
  { position: [0, 0, 0.57], radiusTop: 0.108, radiusBottom: 0.108, height: 0.08, rotation: [Math.PI / 2, 0, 0], radialSegments: 12 },
]);

const TURRET_FLASH_GEOMETRY = transformTurretGeometry(
  new THREE.ConeGeometry(0.16, 0.3, 6, 1, true),
  [0, 0, 0],
  [Math.PI / 2, 0, 0],
);

// 全タレットで共有できる静的マテリアル。発光量を更新するフラッシュだけ個別生成する。
const TURRET_MATERIALS = {
  barrel: new THREE.MeshStandardMaterial({ color: GUN_BARREL_COLOR, roughness: 0.42, metalness: 0.72 }),
  body: new THREE.MeshStandardMaterial({ color: GUN_BODY_COLOR, roughness: 0.48, metalness: 0.42 }),
  armor: new THREE.MeshStandardMaterial({ color: ARMOR_COLOR, roughness: 0.4, metalness: 0.56 }),
  mount: new THREE.MeshStandardMaterial({ color: GUN_MOUNT_COLOR, roughness: 0.62, metalness: 0.36 }),
  base: new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.44, metalness: 0.58 }),
  ammo: new THREE.MeshStandardMaterial({ color: AMMO_COLOR, roughness: 0.56, metalness: 0.3 }),
  accent: new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    roughness: 0.25,
    metalness: 0.15,
    emissive: ACCENT_COLOR,
    emissiveIntensity: 0.7,
  }),
  sensor: new THREE.MeshStandardMaterial({
    color: SENSOR_COLOR,
    roughness: 0.18,
    metalness: 0.2,
    emissive: SENSOR_COLOR,
    emissiveIntensity: 0.9,
  }),
} as const;

const TURRET_EXCLUDED_BLOCKS = new Set([BLOCK_IDS.TURRET]);

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
  const blockIndexVersion = useWorldStore((s) => s.blockIndexVersion);
  const getIndexedBlockPositions = useWorldStore((s) => s.getIndexedBlockPositions);

  const turretPositions = useMemo<TurretPos[]>(() => {
    // blockIndexVersion は索引更新時にこのメモを作り直すためのトリガー
    void blockIndexVersion;
    return getIndexedBlockPositions(BLOCK_IDS.TURRET).map((pos) => ({
      x: pos.x + 0.5,
      y: pos.y + 0.5,
      z: pos.z + 0.5,
      key: `${pos.x},${pos.y},${pos.z}`,
    }));
  }, [blockIndexVersion, getIndexedBlockPositions]);

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
  const muzzleRef = useRef<THREE.Group>(null);
  const flashRef = useRef<THREE.Mesh>(null);
  const barrelClusterRef = useRef<THREE.Group>(null);
  const lastFireTime = useRef(0);
  const flashTimer = useRef(0);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0);
  const barrelRotation = useRef(0);
  const barrelSpinVelocity = useRef(0);
  const isMouseDown = useRef(false);
  const muzzleWorld = useRef(new THREE.Vector3());
  const shootDir = useRef(new THREE.Vector3());
  const targetPoint = useRef(new THREE.Vector3());
  const turretPosVec = useRef(new THREE.Vector3());
  const { camera } = useThree();

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

  const [projectiles, setProjectiles] = useState<TurretProjectile[]>([]);
  const [impacts, setImpacts] = useState<TurretImpact[]>([]);
  const projectilesRef = useRef<TurretProjectile[]>([]);
  const impactsRef = useRef<TurretImpact[]>([]);

  // 静的材質は全タレットで共有し、GPUリソースの重複を避ける。
  const {
    barrel: barrelMat,
    body: bodyMat,
    armor: armorMat,
    mount: mountMat,
    base: baseMat,
    ammo: ammoMat,
    accent: accentMat,
    sensor: sensorMat,
  } = TURRET_MATERIALS;
  const flashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: MUZZLE_FLASH_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
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
    const nextImpact: TurretImpact = {
      id: nextTurretProjId++,
      pos: pos.clone(),
      normal: normal.clone(),
      type,
      createdAt: performance.now() / 1000,
      particles,
    };
    const nextImpacts = [...impactsRef.current, nextImpact];
    impactsRef.current = nextImpacts;
    setImpacts(nextImpacts);

    // 着弾音再生
    playBulletImpactSound(pos.distanceTo(camera.position), type);
  }, [camera]);

  // メインループ
  useFrame((_, delta) => {
    const now = performance.now() / 1000;
    const mobs = useMobStore.getState().mobs;
    const getBlock = useWorldStore.getState().getBlock;
    const turretPos = turretPosVec.current.set(position.x, position.y, position.z);

    // 発砲インパルスで銃身を回し、refへ直接反映してReact再描画を発生させない。
    barrelRotation.current = (
      barrelRotation.current + barrelSpinVelocity.current * delta
    ) % (Math.PI * 2);
    barrelSpinVelocity.current = THREE.MathUtils.damp(
      barrelSpinVelocity.current,
      0,
      8,
      delta,
    );
    if (barrelClusterRef.current) {
      barrelClusterRef.current.rotation.z = barrelRotation.current;
    }

    // プレイヤーがタレットの近くにいるか判定（プレイヤー操作モード）
    const camPos = camera.position;
    const distToPlayer = turretPos.distanceTo(camPos);
    const isPlayerControlled = distToPlayer < PLAYER_CONTROL_DISTANCE && !!document.pointerLockElement;

    // --- ターゲット検索（敵モブのみ） ---
    let targetDir: THREE.Vector3 | null = null;
    let hasTargetPoint = false;

    if (isPlayerControlled) {
      // プレイヤー操作: カメラ照準の先をタレットの狙点にする
      const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
      const aimHit = rayMarchProjectile(
        camera.position.clone(),
        cameraDir.clone(),
        TURRET_RANGE,
        getBlock,
        mobs,
        MOB_HIT_RADIUS,
        { excludeBlockIds: TURRET_EXCLUDED_BLOCKS },
      );
      if (aimHit.type !== 'none') {
        targetPoint.current.copy(aimHit.hitPos);
      } else {
        targetPoint.current.copy(camera.position).addScaledVector(cameraDir, TURRET_RANGE);
      }
      targetDir = targetPoint.current.clone().sub(turretPos).normalize();
      hasTargetPoint = true;
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
        targetPoint.current.set(closestMob.x, closestMob.y, closestMob.z);
        targetDir = targetPoint.current.clone().sub(turretPos).normalize();
        hasTargetPoint = true;
      }
    }

    // --- 銃の回転 ---
    if (pivotRef.current && targetDir) {
      const targetYaw = Math.atan2(targetDir.x, targetDir.z);
      const hDist = Math.sqrt(targetDir.x ** 2 + targetDir.z ** 2);
      const targetPitch = -Math.atan2(targetDir.y, hDist);

      const lerpSpeed = (isPlayerControlled ? 18 : 8) * delta;
      currentYaw.current += (targetYaw - currentYaw.current) * Math.min(1, lerpSpeed);
      currentPitch.current += (targetPitch - currentPitch.current) * Math.min(1, lerpSpeed);
      pivotRef.current.rotation.set(currentPitch.current, currentYaw.current, 0);
    }

    // --- 射撃 ---
    const canFire = now - lastFireTime.current > TURRET_FIRE_COOLDOWN;
    const shouldFire = isPlayerControlled
      ? (canFire && isMouseDown.current) // プレイヤー操作時は左クリック中のみ発射
      : (canFire && targetDir !== null);

    if (shouldFire && targetDir && muzzleRef.current) {
      lastFireTime.current = now;

      // 銃口アンカーから狙点へ飛ばし、見た目の砲身と弾道のズレを抑える
      muzzleRef.current.updateWorldMatrix(true, false);
      muzzleRef.current.getWorldPosition(muzzleWorld.current);
      if (hasTargetPoint) {
        shootDir.current.copy(targetPoint.current).sub(muzzleWorld.current);
        if (shootDir.current.lengthSq() < 0.001) {
          shootDir.current.copy(targetDir);
        } else {
          shootDir.current.normalize();
        }
      } else {
        shootDir.current.copy(targetDir);
      }

      // 散布を追加しつつ、弾道を銃身と一致させる
      const spread = 0.018;
      shootDir.current.x += (Math.random() - 0.5) * spread;
      shootDir.current.y += (Math.random() - 0.5) * spread;
      shootDir.current.z += (Math.random() - 0.5) * spread;
      shootDir.current.normalize();

      const vel = shootDir.current.clone().multiplyScalar(BULLET_SPEED);
      const nextProjectile: TurretProjectile = {
        id: nextTurretProjId++,
        pos: muzzleWorld.current.clone(),
        vel,
        createdAt: now,
        prevPos: muzzleWorld.current.clone(),
        dead: false,
      };
      const nextProjectiles = [...projectilesRef.current, nextProjectile];
      projectilesRef.current = nextProjectiles;
      setProjectiles(nextProjectiles);

      // マズルフラッシュ + バレル回転
      flashTimer.current = 0.06;
      barrelSpinVelocity.current = Math.min(barrelSpinVelocity.current + 30, 52);

      // 発射音
      playMachineGunSound(muzzleWorld.current.distanceTo(camera.position));
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
    const currentProjectiles = projectilesRef.current;
    if (currentProjectiles.length > 0) {
      const alive: TurretProjectile[] = [];
      for (const proj of currentProjectiles) {
        if (proj.dead) continue;
        const age = now - proj.createdAt;
        if (age > BULLET_MAX_AGE) continue;

        proj.prevPos.copy(proj.pos);
        proj.vel.y -= BULLET_GRAVITY * delta;

        const moveDir = proj.vel.clone().normalize();
        const moveDist = BULLET_SPEED * delta;

        // 共通レイマーチング（TURRETブロック自体は除外）
        const hitResult = rayMarchProjectile(
          proj.pos,
          moveDir,
          moveDist,
          getBlock,
          mobs,
          MOB_HIT_RADIUS,
          { excludeBlockIds: TURRET_EXCLUDED_BLOCKS },
        );

        if (hitResult.type === 'block') {
          spawnImpact(hitResult.hitPos, hitResult.normal, 'block');
          proj.dead = true;
        } else if (hitResult.type === 'mob' && hitResult.targetId) {
          spawnImpact(hitResult.hitPos, hitResult.normal, 'mob');
          useMobStore.getState().damageMob(hitResult.targetId, TURRET_DAMAGE, moveDir.x, moveDir.z);
          const sendMobDamage = useMultiplayerStore.getState().sendMobDamage;
          sendMobDamage(hitResult.targetId, TURRET_DAMAGE, moveDir.x * 3, moveDir.z * 3);
          const mob = mobs.find(m => m.id === hitResult.targetId);
          if (mob) spawnDamagePopup(TURRET_DAMAGE, mob.x, mob.y + 1.0, mob.z, false);
          proj.dead = true;
        }

        if (!proj.dead) alive.push(proj);
      }

      if (alive.length !== currentProjectiles.length) {
        projectilesRef.current = alive;
        setProjectiles(alive);
      }
    }

    // --- インパクトエフェクト期限切れ除去 ---
    const filteredImpacts = impactsRef.current.filter((e) => now - e.createdAt < IMPACT_LIFETIME);
    if (filteredImpacts.length !== impactsRef.current.length) {
      impactsRef.current = filteredImpacts;
      setImpacts(filteredImpacts);
    }
  });

  return (
    <>
      <group position={[position.x, position.y, position.z]}>
        {/* === 安定脚付き台座 === */}
        <mesh
          geometry={TURRET_BASE_GEOMETRY}
          material={baseMat}
          receiveShadow
        />
        <mesh
          geometry={TURRET_PEDESTAL_GEOMETRY}
          material={mountMat}
          receiveShadow
        />
        <mesh geometry={TURRET_ACCENT_GEOMETRY} material={accentMat} />

        {/* === 旋回・俯仰する装甲ヘッド === */}
        <group ref={pivotRef} position={[0, 0.27, 0]}>
          <group ref={gunGroupRef}>
            <mesh
              geometry={TURRET_HEAD_MOUNT_GEOMETRY}
              material={mountMat}
              receiveShadow
            />
            <mesh
              geometry={TURRET_ARMOR_GEOMETRY}
              material={armorMat}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={TURRET_RECEIVER_GEOMETRY}
              material={bodyMat}
              receiveShadow
            />
            <mesh
              geometry={TURRET_AMMO_GEOMETRY}
              material={ammoMat}
            />
            <mesh geometry={TURRET_SENSOR_GEOMETRY} material={sensorMat} />

            {/* 発射時だけ慣性回転する四連銃身 */}
            <group ref={barrelClusterRef} position={[0, 0.015, 0.5]}>
              <mesh
                geometry={TURRET_BARREL_GEOMETRY}
                material={barrelMat}
              />
            </group>

            <group ref={muzzleRef} position={[0, 0.015, 1.1]} />
            <mesh
              ref={flashRef}
              geometry={TURRET_FLASH_GEOMETRY}
              position={[0, 0.015, 1.17]}
              material={flashMat}
            />
          </group>
        </group>
      </group>

      {/* === 弾丸トレイル === */}
      {projectiles.map((proj) => (
        <TurretTrail key={proj.id} projectile={proj} />
      ))}

      {/* === インパクトエフェクト === */}
      {impacts.map((effect) => (
        <TurretImpactEffect key={effect.id} effect={effect} />
      ))}
    </>
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
      <mesh ref={bulletRef} position={projectile.pos}>
        <sphereGeometry args={[0.1, 6, 6]} />
        <meshBasicMaterial color={SPARK_COLOR} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={trailRef} visible={false}>
        <cylinderGeometry args={[0.06, 0.02, 1, 4]} />
        <meshBasicMaterial
          color={TRACER_COLOR}
          transparent
          opacity={0.7}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ────────────────────────────────────────────────────────
// インパクトエフェクト
// ────────────────────────────────────────────────────────
function TurretImpactEffect({ effect }: { effect: TurretImpact }) {
  const particlesRef = useRef<THREE.Mesh[]>([]);
  const particleStateRef = useRef(
    effect.particles.map((particle) => ({
      vel: particle.vel.clone(),
      pos: particle.pos.clone(),
      size: particle.size,
    })),
  );

  useFrame(() => {
    const now = performance.now() / 1000;
    const age = now - effect.createdAt;
    const progress = age / IMPACT_LIFETIME;
    if (progress >= 1) return;

    const dt = 1 / 60;
    for (let i = 0; i < particleStateRef.current.length; i++) {
      const p = particleStateRef.current[i];
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
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
