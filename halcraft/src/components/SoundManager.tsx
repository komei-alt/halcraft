// サウンドマネージャーコンポーネント
// 毎フレームでゲーム状態を監視し、適切なタイミングでサウンドを再生する
// R3F の useFrame で動作

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMobStore } from '../stores/useMobStore';
import { useGameStore } from '../stores/useGameStore';
import {
  playBiomeFootstepSound,
  playAllyMove,
  playZombieGrunt,
  playHelicopterRotor,
} from '../utils/sounds';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useCoasterStore } from '../stores/useCoasterStore';
import { useModeFlowStore } from '../stores/useModeFlowStore';
import { setBGMPresence, startBGM } from '../utils/musicManager';
import { initAmbientSounds, setAmbientPresence, updateAmbientSounds } from '../utils/ambientSounds';
import { SEA_LEVEL } from '../types/blocks';
import { getStageModeRule } from '../types/stageModeRules';
import { stopLightsaberHumLoop } from '../utils/lightsaberSounds';

/** 足音の最小水平速度（これ以下では鳴らない） */
const FOOTSTEP_MIN_SPEED = 2.0;
/** 垂直速度がこれ以上だと空中とみなし足音を止める */
const FOOTSTEP_MAX_VERTICAL_SPEED = 3.2;
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
  const bgmStarted = useRef(false);
  const lastAudioPresence = useRef(1);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const gameState = useGameStore.getState();
    const playerState = usePlayerStore.getState();

    // ポーズ・死亡・メニューでは BGM/環境音を下げ、効果音ループも止める
    const audioActive = gameState.phase === 'playing' && !playerState.isDead;
    const targetPresence = audioActive
      ? 1
      : gameState.phase === 'paused'
        ? 0.22
        : gameState.phase === 'stageclear'
          ? 0.35
          : 0.08;
    if (Math.abs(lastAudioPresence.current - targetPresence) > 0.001) {
      lastAudioPresence.current = targetPresence;
      setBGMPresence(targetPresence);
      setAmbientPresence(targetPresence);
      if (!audioActive) {
        stopLightsaberHumLoop();
      }
    }

    // ゲームプレイ中のみ SFX / 環境パラメータ更新
    if (!audioActive) return;

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

      // BGMと環境音を開始
      if (!bgmStarted.current) {
        bgmStarted.current = true;
        startBGM();
        initAmbientSounds();
        setBGMPresence(1);
        setAmbientPresence(1);
      }
      return;
    }

    // --- プレイヤーの水平速度を推定 ---
    const dx = cx - lastCameraPos.current.x;
    const dy = cy - lastCameraPos.current.y;
    const dz = cz - lastCameraPos.current.z;
    const horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / dt;
    const verticalSpeed = Math.abs(dy) / dt;
    lastCameraPos.current = { x: cx, y: cy, z: cz };

    // --- 足音（地上歩行のみ。乗り物・飛行・水中では鳴らさない） ---
    const vehicleState = useVehicleStore.getState();
    const inVehicle = vehicleState.getActiveVehicle() !== null;
    const onCoaster = useCoasterStore.getState().isBoarded;
    const creativeFlying = gameState.creativeFlying;
    const canPlayFootstep =
      !playerState.isDead
      && !playerState.isSubmerged
      && !inVehicle
      && !onCoaster
      && !creativeFlying
      && verticalSpeed < FOOTSTEP_MAX_VERTICAL_SPEED;

    if (canPlayFootstep && horizontalSpeed > FOOTSTEP_MIN_SPEED) {
      footstepTimer.current += dt;
      // ダッシュ時は少し早めに鳴らしてリズムを足に合わせる
      const interval = horizontalSpeed > 6.2 ? FOOTSTEP_INTERVAL * 0.78 : FOOTSTEP_INTERVAL;
      if (footstepTimer.current >= interval) {
        playBiomeFootstepSound(
          gameState.currentStage?.biome,
          gameState.currentStage?.category ?? null,
          Math.min(1.32, horizontalSpeed / 5.5),
        );
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

    // --- ヘリコプターのローター音 ---
    if (vehicleState.helicopter.spawned) {
      const hx = vehicleState.helicopter.x;
      const hy = vehicleState.helicopter.y;
      const hz = vehicleState.helicopter.z;
      const dx = hx - cx;
      const dy = hy - cy;
      const dz = hz - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      const someoneBoarded = Object.values(vehicleState.helicopter.seats).some((id) => id !== null);
      if (someoneBoarded) {
        playHelicopterRotor(dist);
      }
    }

    // --- 環境音の更新 ---
    const isUnderwater = playerState.isSubmerged;
    const isUnderground = cy < SEA_LEVEL;
    const isOutside = !isUnderground;
    const modeState = useModeFlowStore.getState();
    const modeRule = getStageModeRule(gameState.currentStage?.id);
    const modeFlowRatio = modeRule ? modeState.meter / modeRule.threshold : 0;
    updateAmbientSounds(
      isOutside,
      isUnderwater,
      isUnderground,
      cy,
      gameState.currentBiome?.id,
      gameState.isNight,
      gameState.currentStage?.rules.ambientIntensity ?? 1,
      gameState.currentStage?.category ?? null,
      modeFlowRatio,
      modeState.flowRank,
    );
  });

  return null;
}
