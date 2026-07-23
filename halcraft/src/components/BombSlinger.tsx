// ボムスリンガー — 粘着ボム投擲＆遠隔起爆
// 左クリック: 放物線（重力付き）で投擲し壁・床・敵に吸着
// 右クリック: 設置中ボムを一斉起爆
// 投げモーションは手元から放射状に弧を描くスイング

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_IDS } from '../types/blocks';
import { getMasteryBonus } from '../types/masteryPerks';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { isTouchDevice } from '../utils/device';
import { spawnCombatExplosion, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import { getMobHitbox, getMobHitboxMaxY } from '../utils/mobHitboxes';
import {
  playBombStickSound,
  playBombThrowSound,
  playBombTickSound,
  playRocketExplosionSound,
} from '../utils/sounds';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';

const THROW_COOLDOWN = 0.42;
/** 投げモーション全体の長さ（秒） */
const THROW_ANIM_DURATION = 0.38;
const BOMB_FUSE = 5.2;
/** 初速（m/s 相当）。弧が見えるよう少し抑える */
const BOMB_SPEED = 14.5;
/** 重力加速度（下向き） */
const BOMB_GRAVITY = -22;
/** 照準に加算する放射状ロフト（放物線をはっきりさせる） */
const THROW_LOFT = 0.48;
const BLAST_RADIUS = 3.6;
const BLAST_DAMAGE = 5;
const BASE_MAX_BOMBS = 3;
const TRAJ_POINTS = 18;
const TRAIL_POINTS = 10;
const HOLDER_OFFSET = new THREE.Vector3(0.38, -0.42, -0.95);
/** 物理サブステップ（トンネル防止） */
const PHYS_SUBSTEPS = 3;

interface StickyBomb {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  fuse: number;
  stuck: boolean;
  stuckMobId: string | null;
  stuckOffset: THREE.Vector3;
  blink: number;
  /** 飛行中のスピン角（ラジアン） */
  spin: number;
  /** 軌道トレイル（古い→新しい） */
  trail: Float32Array;
  trailCount: number;
}

interface BombVisuals {
  root: THREE.Group;
  trail: THREE.Line;
  trailGeo: THREE.BufferGeometry;
}

let nextBombId = 1;

function easeOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

function easeInOutCubic(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

/** 照準方向から、重力下で弧を描く初速を計算する */
function computeThrowVelocity(
  aimDir: THREE.Vector3,
  outVel: THREE.Vector3,
  outDir: THREE.Vector3,
): void {
  outDir.copy(aimDir).normalize();
  // 視線に上方向成分を足し、真下・真上でも破綻しないようクランプ
  const loftScale = 1 - Math.min(0.55, Math.abs(outDir.y) * 0.5);
  outDir.y = THREE.MathUtils.clamp(outDir.y + THROW_LOFT * loftScale, -0.75, 0.92);
  outDir.normalize();
  outVel.copy(outDir).multiplyScalar(BOMB_SPEED);
}

function isPassableBlock(blockId: number): boolean {
  return blockId === BLOCK_IDS.AIR
    || blockId === BLOCK_IDS.WATER
    || blockId === BLOCK_IDS.LAVA
    || blockId === BLOCK_IDS.NETHER_PORTAL;
}

function pushTrail(bomb: StickyBomb, x: number, y: number, z: number): void {
  const n = TRAIL_POINTS;
  if (bomb.trailCount < n) {
    const i = bomb.trailCount;
    bomb.trail[i * 3] = x;
    bomb.trail[i * 3 + 1] = y;
    bomb.trail[i * 3 + 2] = z;
    bomb.trailCount += 1;
    return;
  }
  // 左シフトして末尾に追加
  bomb.trail.copyWithin(0, 3);
  bomb.trail[(n - 1) * 3] = x;
  bomb.trail[(n - 1) * 3 + 1] = y;
  bomb.trail[(n - 1) * 3 + 2] = z;
}

export function BombSlinger() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);

  const rootRef = useRef<THREE.Group>(null);
  const armPivotRef = useRef<THREE.Group>(null);
  const chamberGlowRef = useRef<THREE.Mesh>(null);
  const readyBombRef = useRef<THREE.Group>(null);
  const ammoDotsRef = useRef<(THREE.Mesh | null)[]>([]);
  const trajRef = useRef<THREE.Points>(null);
  const bombsRef = useRef<StickyBomb[]>([]);
  const bombVisualsRef = useRef(new Map<number, BombVisuals>());
  const bombWorldRootRef = useRef<THREE.Group>(null);
  const [, setBombVersion] = useState(0);
  const throwCd = useRef(0);
  /** 0=待機, 投げ中は経過秒 */
  const throwAnimT = useRef(0);
  const throwAnimating = useRef(false);
  const idleT = useRef(0);
  const lastHudSync = useRef(0);
  const isTouch = useRef(isTouchDevice());
  const lastTickSecond = useRef(new Map<number, number>());
  const stickFlash = useRef(new Map<number, number>());

  const aimDir = useRef(new THREE.Vector3());
  const throwVel = useRef(new THREE.Vector3());
  const throwDir = useRef(new THREE.Vector3());
  const offsetWorld = useRef(new THREE.Vector3());
  const rightWorld = useRef(new THREE.Vector3());
  const upWorld = useRef(new THREE.Vector3());

  const trajGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_POINTS * 3), 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);
  const trajMat = useMemo(() => new THREE.PointsMaterial({
    color: 0xffaa66,
    size: 0.11,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }), []);
  const trailMat = useMemo(() => new THREE.LineBasicMaterial({
    color: 0xff8844,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const accent = useMemo(() => new THREE.Color(0xff8a6a), []);
  const accentHot = useMemo(() => new THREE.Color(0xffe0a0), []);

  const getMaxBombs = useCallback(() => {
    const level = useMasteryStore.getState().items.bomb_slinger?.level ?? 1;
    const bonus = getMasteryBonus('bomb_slinger', level);
    return BASE_MAX_BOMBS + bonus.bombMaxCountBonus;
  }, []);

  const getBlastMult = useCallback(() => {
    const level = useMasteryStore.getState().items.bomb_slinger?.level ?? 1;
    return getMasteryBonus('bomb_slinger', level).bombBlastMultiplier;
  }, []);

  const disposeBombVisual = useCallback((id: number) => {
    const visual = bombVisualsRef.current.get(id);
    if (!visual) return;
    visual.root.removeFromParent();
    visual.trailGeo.dispose();
    bombVisualsRef.current.delete(id);
  }, []);

  const ensureBombVisual = useCallback((bomb: StickyBomb): BombVisuals => {
    const existing = bombVisualsRef.current.get(bomb.id);
    if (existing) return existing;

    const root = new THREE.Group();
    root.name = `bomb-${bomb.id}`;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 12),
      new THREE.MeshStandardMaterial({
        color: '#2a2a2a',
        emissive: '#ff6622',
        emissiveIntensity: 0.55,
        roughness: 0.55,
      }),
    );
    body.castShadow = true;
    root.add(body);

    const fuseStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: '#c4a060', roughness: 0.7 }),
    );
    fuseStem.position.y = 0.18;
    root.add(fuseStem);

    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.7,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      }),
    );
    spark.position.y = 0.28;
    root.add(spark);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff8844,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.05;
    root.add(ring);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3),
    );
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.frustumCulled = false;
    root.add(trail);

    bombWorldRootRef.current?.add(root);
    const visual: BombVisuals = { root, trail, trailGeo };
    bombVisualsRef.current.set(bomb.id, visual);
    return visual;
  }, [trailMat]);

  const detonateBomb = useCallback((bomb: StickyBomb) => {
    const mult = getBlastMult();
    const radius = BLAST_RADIUS * (0.9 + mult * 0.1);
    const damage = Math.max(1, Math.round(BLAST_DAMAGE * mult));
    spawnCombatExplosion(bomb.x, bomb.y, bomb.z, {
      style: 'bomb',
      scale: 0.72 * mult,
      intensity: 0.85 * mult,
      accent: '#ff7a40',
    });
    playRocketExplosionSound(
      camera.position.distanceTo(new THREE.Vector3(bomb.x, bomb.y, bomb.z)),
    );

    const mobs = useMobStore.getState().mobs;
    const multi = useMultiplayerStore.getState();
    let hits = 0;
    for (const mob of mobs) {
      if (mob.type === 'chicken') continue;
      const hitbox = getMobHitbox(mob.type);
      const cy = mob.y + hitbox.height * 0.4;
      const dx = mob.x - bomb.x;
      const dy = cy - bomb.y;
      const dz = mob.z - bomb.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const dmg = Math.max(1, Math.round(damage * (0.45 + falloff * 0.7)));
      const kb = 0.55 * falloff * (mob.type === 'boss_giant' ? 0.25 : 1);
      const nx = dist > 0.01 ? dx / dist : 0;
      const nz = dist > 0.01 ? dz / dist : 0;
      useMobStore.getState().damageMob(mob.id, dmg, nx * kb, nz * kb);
      if (multi.connected) multi.sendMobDamage(mob.id, dmg, nx * kb, nz * kb);
      spawnDamagePopup(dmg, mob.x, getMobHitboxMaxY(mob.y, hitbox) - 0.8, mob.z, falloff > 0.75);
      spawnHitImpactEffect(mob.x, cy, mob.z, nx, 0.35, nz, falloff > 0.75);
      hits++;
    }

    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, 0.22 + hits * 0.04)),
    }));
    if (hits > 0) {
      useMasteryStore.getState().recordItemHit('bomb_slinger', {
        label: hits >= 3 ? 'まとめて爆破' : 'ボムヒット',
        amount: 5 + hits * 3,
        critical: hits >= 3,
      });
    }
  }, [camera, getBlastMult]);

  const detonateAll = useCallback(() => {
    const bombs = [...bombsRef.current];
    if (bombs.length === 0) {
      usePlayerStore.setState((s) => ({
        cameraShake: Math.min(1, Math.max(s.cameraShake, 0.06)),
      }));
      return;
    }
    const count = bombs.length;
    bombsRef.current = [];
    lastTickSecond.current.clear();
    stickFlash.current.clear();
    for (const b of bombs) disposeBombVisual(b.id);
    setBombVersion((v) => v + 1);
    usePlayerStore.getState().triggerWeaponAction('bomb');
    bombs.forEach((b, i) => {
      window.setTimeout(() => detonateBomb(b), i * 70);
    });
    useMasteryStore.getState().recordItemUse('bomb_slinger', {
      label: `一斉起爆 x${count}`,
      amount: 6 + count * 3,
    });
    useMasteryStore.getState().recordItemHit('bomb_slinger', {
      label: count >= 3 ? '連鎖起爆' : '同時起爆',
      amount: 8 + count * 2,
      critical: count >= 3,
    });
    usePlayerStore.setState({ bombArmedCount: 0 });
  }, [detonateBomb, disposeBombVisual]);

  const throwBomb = useCallback(() => {
    if (throwCd.current > 0) return;
    const max = getMaxBombs();
    if (bombsRef.current.length >= max) {
      const oldest = bombsRef.current.shift();
      if (oldest) {
        disposeBombVisual(oldest.id);
        detonateBomb(oldest);
        stickFlash.current.delete(oldest.id);
      }
    }

    throwCd.current = THROW_COOLDOWN;
    throwAnimating.current = true;
    throwAnimT.current = 0;

    aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    computeThrowVelocity(aimDir.current, throwVel.current, throwDir.current);

    // 手元ホルダー位置から放射状に飛び出す
    const start = camera.position.clone()
      .addScaledVector(aimDir.current, 0.55)
      .add(new THREE.Vector3(0.28, -0.22, 0).applyQuaternion(camera.quaternion));

    const bomb: StickyBomb = {
      id: nextBombId++,
      x: start.x,
      y: start.y,
      z: start.z,
      vx: throwVel.current.x,
      vy: throwVel.current.y,
      vz: throwVel.current.z,
      age: 0,
      fuse: BOMB_FUSE,
      stuck: false,
      stuckMobId: null,
      stuckOffset: new THREE.Vector3(),
      blink: 0,
      spin: 0,
      trail: new Float32Array(TRAIL_POINTS * 3),
      trailCount: 0,
    };
    pushTrail(bomb, start.x, start.y, start.z);
    bombsRef.current.push(bomb);
    ensureBombVisual(bomb);
    setBombVersion((v) => v + 1);
    playBombThrowSound();
    usePlayerStore.getState().triggerWeaponAction('bomb');
    useMasteryStore.getState().recordItemUse('bomb_slinger', { label: 'ボム投擲', amount: 3 });
    usePlayerStore.setState({
      bombArmedCount: bombsRef.current.length,
      bombMaxCount: max,
      cameraShake: Math.min(1, Math.max(usePlayerStore.getState().cameraShake, 0.1)),
    });
  }, [camera, detonateBomb, disposeBombVisual, ensureBombVisual, getMaxBombs]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (usePlayerStore.getState().equippedItem !== 'bomb_slinger') return;
      if (!isDesktopGameplayInputActive()) return;
      if (useGameStore.getState().phase !== 'playing') return;
      if (usePlayerStore.getState().isDead) return;
      if (useVehicleStore.getState().isInVehicle()) return;
      if (e.button === 0) throwBomb();
      if (e.button === 2) {
        e.preventDefault();
        detonateAll();
      }
    };
    const onContext = (e: Event) => {
      if (usePlayerStore.getState().equippedItem === 'bomb_slinger') e.preventDefault();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('contextmenu', onContext);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [detonateAll, throwBomb]);

  useEffect(() => () => {
    for (const id of [...bombVisualsRef.current.keys()]) {
      disposeBombVisual(id);
    }
    trajGeo.dispose();
    trajMat.dispose();
    trailMat.dispose();
  }, [disposeBombVisual, trajGeo, trajMat, trailMat]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    idleT.current += dt;
    throwCd.current = Math.max(0, throwCd.current - dt);

    if (throwAnimating.current) {
      throwAnimT.current += dt;
      if (throwAnimT.current >= THROW_ANIM_DURATION) {
        throwAnimating.current = false;
        throwAnimT.current = THROW_ANIM_DURATION;
      }
    }

    const visible = phase === 'playing'
      && equippedItem === 'bomb_slinger'
      && !isDead
      && !useVehicleStore.getState().isInVehicle();

    if (rootRef.current) rootRef.current.visible = visible;

    // --- 投げモーション: 放射状アーク（溜め → 振り出し → 戻り） ---
    const animU = throwAnimating.current
      ? THREE.MathUtils.clamp(throwAnimT.current / THROW_ANIM_DURATION, 0, 1)
      : 0;
    // 0-0.35 溜め / 0.35-0.62 振り出し / 0.62-1 戻り
    let swing = 0;
    let lift = 0;
    let twist = 0;
    let punch = 0;
    if (animU > 0) {
      if (animU < 0.35) {
        const t = easeInOutCubic(animU / 0.35);
        swing = -0.55 * t;
        lift = 0.35 * t;
        twist = -0.4 * t;
      } else if (animU < 0.62) {
        const t = easeOutCubic((animU - 0.35) / 0.27);
        swing = THREE.MathUtils.lerp(-0.55, 1.05, t);
        lift = THREE.MathUtils.lerp(0.35, -0.25, t);
        twist = THREE.MathUtils.lerp(-0.4, 0.55, t);
        punch = t;
      } else {
        const t = easeInOutCubic((animU - 0.62) / 0.38);
        swing = THREE.MathUtils.lerp(1.05, 0, t);
        lift = THREE.MathUtils.lerp(-0.25, 0, t);
        twist = THREE.MathUtils.lerp(0.55, 0, t);
        punch = 1 - t;
      }
    }

    if (visible) {
      if (isTouch.current) {
        if (consumeBreakBlock()) throwBomb();
        if (consumePlaceBlock()) detonateAll();
      }

      offsetWorld.current.copy(HOLDER_OFFSET);
      offsetWorld.current.y += Math.sin(idleT.current * 1.8) * 0.012;
      // 振り出しで手元が前へせり出す
      offsetWorld.current.z += punch * 0.22;
      offsetWorld.current.y += lift * 0.12;
      offsetWorld.current.x += twist * 0.06;
      offsetWorld.current.applyQuaternion(camera.quaternion);

      if (rootRef.current) {
        rootRef.current.position.copy(camera.position).add(offsetWorld.current);
        rootRef.current.quaternion.copy(camera.quaternion);
      }
      if (armPivotRef.current) {
        // 放射状スイング: ピッチ（上下）とヨー（横振り）で弧を描く
        armPivotRef.current.rotation.set(
          swing * 0.85 + lift * 0.35,
          twist * 0.55,
          -twist * 0.4 + swing * 0.15,
        );
      }
      if (readyBombRef.current) {
        // 投げ瞬間に手元ボムが消えて飛び出す
        const hide = animU > 0.32 && animU < 0.72;
        readyBombRef.current.visible = !hide;
        readyBombRef.current.scale.setScalar(hide ? 0.01 : 1 + punch * 0.15);
      }

      const max = getMaxBombs();
      const count = bombsRef.current.length;
      if (chamberGlowRef.current) {
        const mat = chamberGlowRef.current.material as THREE.MeshBasicMaterial;
        const full = count >= max;
        mat.color.copy(full ? accentHot : accent);
        mat.opacity = 0.28 + count * 0.14 + punch * 0.4;
        chamberGlowRef.current.scale.setScalar(0.52 + count * 0.1 + punch * 0.2);
      }
      for (let i = 0; i < 5; i++) {
        const dot = ammoDotsRef.current[i];
        if (!dot) continue;
        const active = i < max;
        const filled = i < count;
        dot.visible = active;
        if (!active) continue;
        const mat = dot.material as THREE.MeshBasicMaterial;
        mat.color.set(filled ? 0xff7744 : 0x443322);
        mat.opacity = filled ? 0.95 : 0.35;
        dot.scale.setScalar(filled ? 1.1 : 0.75);
      }

      // 軌道プレビュー（実際の投擲と同じ初速・重力）
      if (trajRef.current) {
        aimDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        computeThrowVelocity(aimDir.current, throwVel.current, throwDir.current);
        rightWorld.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        upWorld.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
        let px = camera.position.x + aimDir.current.x * 0.55 + rightWorld.current.x * 0.28 - upWorld.current.x * 0.22;
        let py = camera.position.y + aimDir.current.y * 0.55 + rightWorld.current.y * 0.28 - upWorld.current.y * 0.22;
        let pz = camera.position.z + aimDir.current.z * 0.55 + rightWorld.current.z * 0.28 - upWorld.current.z * 0.22;
        let vx = throwVel.current.x;
        let vy = throwVel.current.y;
        let vz = throwVel.current.z;
        const posAttr = trajGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const step = 0.065;
        let drawn = 0;
        const getBlock = useWorldStore.getState().getBlock;
        for (let i = 0; i < TRAJ_POINTS; i++) {
          arr[i * 3] = px;
          arr[i * 3 + 1] = py;
          arr[i * 3 + 2] = pz;
          drawn++;
          vy += BOMB_GRAVITY * step;
          px += vx * step;
          py += vy * step;
          pz += vz * step;
          const block = getBlock(Math.floor(px), Math.floor(py), Math.floor(pz));
          if (!isPassableBlock(block)) break;
        }
        posAttr.needsUpdate = true;
        trajGeo.setDrawRange(0, drawn);
        trajRef.current.visible = throwCd.current < 0.18 && animU < 0.2;
        trajMat.opacity = 0.4 + (1 - throwCd.current / THROW_COOLDOWN) * 0.4;
      }

      lastHudSync.current += dt;
      if (lastHudSync.current > 0.1) {
        lastHudSync.current = 0;
        usePlayerStore.setState({
          bombArmedCount: count,
          bombMaxCount: max,
        });
      }
    } else if (trajRef.current) {
      trajRef.current.visible = false;
    }

    // --- ボム物理（重力付き放物線） ---
    const getBlock = useWorldStore.getState().getBlock;
    const mobs = useMobStore.getState().mobs;
    let structureChanged = false;

    for (let i = bombsRef.current.length - 1; i >= 0; i--) {
      const b = bombsRef.current[i];
      b.age += dt;
      b.fuse -= dt;
      b.blink += dt;

      if (b.stuck && b.stuckMobId) {
        const mob = mobs.find((m) => m.id === b.stuckMobId);
        if (mob) {
          b.x = mob.x + b.stuckOffset.x;
          b.y = mob.y + b.stuckOffset.y;
          b.z = mob.z + b.stuckOffset.z;
        } else {
          b.stuckMobId = null;
        }
      }

      if (!b.stuck) {
        const subDt = dt / PHYS_SUBSTEPS;
        for (let s = 0; s < PHYS_SUBSTEPS; s++) {
          // 重力
          b.vy += BOMB_GRAVITY * subDt;
          const nx = b.x + b.vx * subDt;
          const ny = b.y + b.vy * subDt;
          const nz = b.z + b.vz * subDt;

          const block = getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
          if (!isPassableBlock(block)) {
            b.stuck = true;
            b.vx = 0;
            b.vy = 0;
            b.vz = 0;
            b.x = nx;
            b.y = ny;
            b.z = nz;
            playBombStickSound();
            stickFlash.current.set(b.id, 1);
            structureChanged = true;
            break;
          }

          let stuckMob = false;
          for (const mob of mobs) {
            if (mob.type === 'chicken') continue;
            const hitbox = getMobHitbox(mob.type);
            const dx = nx - mob.x;
            const dy = ny - (mob.y + hitbox.height * 0.4);
            const dz = nz - mob.z;
            const r = hitbox.radius + 0.25;
            if (dx * dx + dz * dz < r * r && Math.abs(dy) < hitbox.height * 0.6) {
              b.stuck = true;
              b.stuckMobId = mob.id;
              b.stuckOffset.set(dx, dy + hitbox.height * 0.4, dz);
              b.vx = 0;
              b.vy = 0;
              b.vz = 0;
              b.x = nx;
              b.y = ny;
              b.z = nz;
              playBombStickSound();
              stickFlash.current.set(b.id, 1);
              stuckMob = true;
              structureChanged = true;
              break;
            }
          }
          if (stuckMob) break;

          b.x = nx;
          b.y = ny;
          b.z = nz;
          // 速度に応じてスピン
          const speed = Math.hypot(b.vx, b.vy, b.vz);
          b.spin += speed * subDt * 2.4;
        }
        if (!b.stuck) {
          pushTrail(b, b.x, b.y, b.z);
        }
      }

      // 毎フレーム見た目を追従（飛行中も弧が動く）
      const visual = ensureBombVisual(b);
      visual.root.position.set(b.x, b.y, b.z);
      if (!b.stuck) {
        visual.root.rotation.set(b.spin * 0.9, b.spin * 1.3, b.spin * 0.5);
        visual.trail.visible = true;
        const posAttr = visual.trailGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const count = b.trailCount;
        for (let t = 0; t < count; t++) {
          // トレイルはワールド座標 → ルート相対
          arr[t * 3] = b.trail[t * 3] - b.x;
          arr[t * 3 + 1] = b.trail[t * 3 + 1] - b.y;
          arr[t * 3 + 2] = b.trail[t * 3 + 2] - b.z;
        }
        posAttr.needsUpdate = true;
        visual.trailGeo.setDrawRange(0, count);
      } else {
        visual.trail.visible = false;
        visual.root.rotation.set(0, b.blink * 0.4, 0);
      }

      // 見た目マテリアル更新（緊急点滅）
      const body = visual.root.children[0] as THREE.Mesh | undefined;
      const spark = visual.root.children[2] as THREE.Mesh | undefined;
      const ring = visual.root.children[3] as THREE.Mesh | undefined;
      const urgent = b.fuse < 1.5;
      const blink = urgent ? 0.55 + Math.sin(b.blink * 22) * 0.45 : 0.7 + Math.sin(b.blink * 6) * 0.3;
      const stick = stickFlash.current.get(b.id) ?? 0;
      if (body?.material instanceof THREE.MeshStandardMaterial) {
        body.material.color.set(urgent ? '#ff4422' : '#2a2a2a');
        body.material.emissive.set(urgent ? '#ff2200' : stick > 0 ? '#ffaa44' : '#ff6622');
        body.material.emissiveIntensity = blink * (urgent ? 1.5 : 0.55) + stick * 1.2;
        body.scale.setScalar(1 + stick * 0.35);
      }
      if (spark?.material instanceof THREE.MeshBasicMaterial) {
        spark.material.color.set(urgent ? '#ffff66' : '#ffaa44');
        spark.material.opacity = 0.4 + blink * 0.5;
      }
      if (ring?.material instanceof THREE.MeshBasicMaterial) {
        ring.material.color.set(urgent ? '#ff5533' : '#ff8844');
        ring.material.opacity = 0.25 + blink * 0.35 + stick * 0.4;
      }

      const secLeft = Math.ceil(b.fuse);
      const prev = lastTickSecond.current.get(b.id);
      if (prev !== secLeft && b.fuse < 3.5 && b.fuse > 0) {
        lastTickSecond.current.set(b.id, secLeft);
        playBombTickSound();
      }

      const sf = stickFlash.current.get(b.id);
      if (sf !== undefined) {
        const next = sf - dt * 2.8;
        if (next <= 0) stickFlash.current.delete(b.id);
        else stickFlash.current.set(b.id, next);
      }

      if (b.fuse <= 0 || b.y < -30) {
        if (b.fuse <= 0) detonateBomb(b);
        disposeBombVisual(b.id);
        bombsRef.current.splice(i, 1);
        lastTickSecond.current.delete(b.id);
        stickFlash.current.delete(b.id);
        structureChanged = true;
      }
    }

    if (structureChanged) {
      setBombVersion((v) => v + 1);
      usePlayerStore.setState({
        bombArmedCount: bombsRef.current.length,
        bombMaxCount: getMaxBombs(),
      });
    }
  });

  return (
    <>
      <group ref={rootRef} visible={false}>
        <group ref={armPivotRef}>
          <mesh position={[0, 0, 0]} renderOrder={40}>
            <boxGeometry args={[0.22, 0.18, 0.38]} />
            <meshStandardMaterial color="#5a3a2a" roughness={0.7} depthTest={false} />
          </mesh>
          <mesh position={[0, 0.02, -0.18]} rotation={[Math.PI / 2, 0, 0]} renderOrder={40}>
            <cylinderGeometry args={[0.1, 0.12, 0.28, 10]} />
            <meshStandardMaterial color="#3d2a20" roughness={0.65} metalness={0.2} depthTest={false} />
          </mesh>
          {/* 手元の装填ボム（投げ瞬間に消えて飛び出す） */}
          <group ref={readyBombRef} position={[0.0, 0.08, 0.05]}>
            <mesh renderOrder={40}>
              <sphereGeometry args={[0.1, 12, 10]} />
              <meshStandardMaterial color="#ff6a40" roughness={0.45} depthTest={false} />
            </mesh>
            <mesh ref={chamberGlowRef} renderOrder={41}>
              <sphereGeometry args={[0.14, 12, 10]} />
              <meshBasicMaterial
                color={0xff8a6a}
                transparent
                opacity={0.35}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh
              key={i}
              ref={(el) => { ammoDotsRef.current[i] = el; }}
              position={[-0.12 + i * 0.06, -0.12, 0.08]}
              renderOrder={42}
              visible={false}
            >
              <sphereGeometry args={[0.025, 8, 6]} />
              <meshBasicMaterial
                color={0xff7744}
                transparent
                opacity={0.9}
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      </group>

      {/* 投擲軌道プレビュー（放物線） */}
      <points ref={trajRef} geometry={trajGeo} material={trajMat} frustumCulled={false} visible={false} />

      {/* ワールド上のボム（物理は useFrame、見た目は imperative 更新） */}
      <group ref={bombWorldRootRef} />
    </>
  );
}
