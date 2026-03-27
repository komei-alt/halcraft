// サウンドマネージャーコンポーネント
// 毎フレームでゲーム状態を監視し、適切なタイミングでサウンドを再生する
// R3F の useFrame で動作

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMobStore } from '../stores/useMobStore';
import { useGameStore } from '../stores/useGameStore';
import {
  playFootstep,
  playAllyMove,
  playZombieGrunt,
} from '../utils/sounds';

/** 足音の最小速度（これ以下では鳴らない） */
const FOOTSTEP_MIN_SPEED = 2.0;
/** 足音の間隔（秒） */
const FOOTSTEP_INTERVAL = 0.35;
/** ゾンビのうめき声の最小間隔（秒） */
const ZOMBIE_GRUNT_MIN_INTERVAL = 3.0;
/** ゾンビのうめき声の最大間隔（秒） */
const ZOMBIE_GRUNT_MAX_INTERVAL = 8.0;
/** 味方動作音の最小間隔（秒） */
const ALLY_SOUND_INTERVAL = 1.5;

export function SoundManager() {
  const { camera } = useThree();

  // タイマー管理
  const footstepTimer = useRef(0);
  const zombieGruntTimer = useRef(-1);
  const allySoundTimer = useRef(0);

  // 前フレームのカメラ位置（速度推定用）
  const lastCameraPos = useRef({ x: 0, y: 0, z: 0 });
  const initialized = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const gameState = useGameStore.getState();
    const playerState = usePlayerStore.getState();

    // ゲームプレイ中のみ
    if (gameState.phase !== 'playing' || playerState.isDead) return;

    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;

    // --- zombieGruntTimer の lazy init ---
    if (zombieGruntTimer.current < 0) {
      zombieGruntTimer.current =
        ZOMBIE_GRUNT_MIN_INTERVAL + Math.random() * (ZOMBIE_GRUNT_MAX_INTERVAL - ZOMBIE_GRUNT_MIN_INTERVAL);
    }

    // --- 初回の位置初期化 ---
    if (!initialized.current) {
      lastCameraPos.current = { x: cx, y: cy, z: cz };
      initialized.current = true;
      return;
    }

    // --- プレイヤーの水平速度を推定 ---
    const dx = cx - lastCameraPos.current.x;
    const dz = cz - lastCameraPos.current.z;
    const horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / dt;
    lastCameraPos.current = { x: cx, y: cy, z: cz };

    // --- 足音 ---
    if (horizontalSpeed > FOOTSTEP_MIN_SPEED) {
      footstepTimer.current += dt;
      if (footstepTimer.current >= FOOTSTEP_INTERVAL) {
        playFootstep();
        footstepTimer.current = 0;
      }
    } else {
      // 止まったらタイマーリセット（次の一歩目ですぐ鳴る）
      footstepTimer.current = FOOTSTEP_INTERVAL;
    }

    // --- モブのサウンド ---
    const mobs = useMobStore.getState().mobs;

    // ゾンビのうめき声（最も近いゾンビの距離で判定）
    zombieGruntTimer.current -= dt;
    if (zombieGruntTimer.current <= 0) {
      let closestZombieDist = Infinity;
      for (const mob of mobs) {
        if (mob.type !== 'zombie') continue;
        const mdx = mob.x - cx;
        const mdz = mob.z - cz;
        const dist = Math.sqrt(mdx * mdx + mdz * mdz);
        if (dist < closestZombieDist) closestZombieDist = dist;
      }
      if (closestZombieDist < 20) {
        playZombieGrunt(closestZombieDist);
      }
      // 次のうめき声タイマーをランダムにリセット
      zombieGruntTimer.current =
        ZOMBIE_GRUNT_MIN_INTERVAL + Math.random() * (ZOMBIE_GRUNT_MAX_INTERVAL - ZOMBIE_GRUNT_MIN_INTERVAL);
    }

    // 味方の動作音
    allySoundTimer.current -= dt;
    if (allySoundTimer.current <= 0) {
      let closestAllyDist = Infinity;
      for (const mob of mobs) {
        if (!mob.isAlly) continue;
        const mdx = mob.x - cx;
        const mdz = mob.z - cz;
        const dist = Math.sqrt(mdx * mdx + mdz * mdz);
        if (dist < closestAllyDist) closestAllyDist = dist;
      }
      // 味方が動いている場合のみ
      if (closestAllyDist < 15) {
        playAllyMove(closestAllyDist);
      }
      allySoundTimer.current = ALLY_SOUND_INTERVAL;
    }
  });

  return null;
}
