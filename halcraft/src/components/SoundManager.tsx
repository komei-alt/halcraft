// サウンドマネージャーコンポーネント
// 毎フレームでゲーム状態を監視し、適切なタイミングでサウンドを再生する
// R3F の useFrame で動作

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMobStore, type MobType } from '../stores/useMobStore';
import { useGameStore } from '../stores/useGameStore';
import { useWorldStore } from '../stores/useWorldStore';
import { playHelicopterRotor } from '../utils/sounds';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useCoasterStore } from '../stores/useCoasterStore';
import { useModeFlowStore } from '../stores/useModeFlowStore';
import { startBGM, stopBGM, updateBGMScene } from '../utils/musicManager';
import {
  initAmbientSounds,
  stopAmbientSounds,
  updateAmbientSounds,
} from '../utils/ambientSounds';
import { SEA_LEVEL } from '../types/blocks';
import { getStageModeRule } from '../types/stageModeRules';
import { stopLightsaberHumLoop } from '../utils/lightsaberSounds';
import { useSettingsStore } from '../stores/useSettingsStore';
import {
  audioEngine,
  playCreatureCue,
  playSurfaceFootstep,
  preloadCreatureAudio,
  resolveFootstepSurface,
} from '../audio';
import { BLOCK_IDS } from '../types/blocks';

/** 足音の最小水平速度（これ以下では鳴らない） */
const FOOTSTEP_MIN_SPEED = 2.0;
/** 垂直速度がこれ以上だと空中とみなし足音を止める */
const FOOTSTEP_MAX_VERTICAL_SPEED = 3.2;
/** 1歩ごとの移動距離。ダッシュは歩幅が広くても接地回数が増えるため少し短くする。 */
const FOOTSTEP_WALK_STRIDE = 1.58;
const FOOTSTEP_RUN_STRIDE = 1.34;
/** カメラと足元の高さ差。 */
const PLAYER_EYE_OFFSET = 1.6;
const CREATURE_IDLE_INTERVALS: Record<MobType, readonly [number, number]> = {
  zombie: [3.8, 7.4],
  spider: [4.6, 8.8],
  darwin: [4.2, 7.8],
  chicken: [3.2, 6.1],
  prototype: [7.5, 12],
  iron_golem: [8.5, 14],
  boss_giant: [4.8, 8],
};

interface MobAudioSnapshot {
  attackActive: boolean;
  hitTimer: number;
  hpRatio: number;
  near: boolean;
}

function randomIdleInterval(type: MobType): number {
  const [minimum, maximum] = CREATURE_IDLE_INTERVALS[type];
  return minimum + Math.random() * (maximum - minimum);
}

export function SoundManager() {
  const { camera } = useThree();

  // タイマー管理
  const footstepDistance = useRef(0);
  const creatureIdleTimers = useRef(new Map<MobType, number>());
  const mobAudioSnapshots = useRef(new Map<string, MobAudioSnapshot>());

  // 前フレームのカメラ位置（速度推定用）
  const lastCameraPos = useRef({ x: 0, y: 0, z: 0 });
  const initialized = useRef(false);
  const bgmStarted = useRef(false);
  const lastAudioPresence = useRef(1);
  const listenerForward = useRef(new Vector3(0, 0, -1));

  // Canvas が外れた（タイトルへ戻る等）ときに音源を確実に止める
  useEffect(() => () => {
    stopLightsaberHumLoop();
    stopBGM();
    stopAmbientSounds();
  }, []);

  useEffect(() => {
    void preloadCreatureAudio();
  }, []);

  useEffect(() => {
    const applySettings = (): void => {
      const settings = useSettingsStore.getState();
      audioEngine.applyMix({
        masterVolume: settings.masterVolume,
        musicVolume: settings.bgmVolume,
        ambienceVolume: settings.ambienceVolume,
        sfxVolume: settings.sfxVolume,
        creatureVolume: settings.creatureVolume,
        voiceChatVolume: settings.voiceChatVolume,
        muted: settings.audioMuted,
        dynamicRange: settings.dynamicRange,
        spatialAudio: settings.spatialAudio,
      });
    };
    applySettings();
    return useSettingsStore.subscribe(applySettings);
  }, []);

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
      audioEngine.setPresence(targetPresence);
      if (!audioActive) {
        stopLightsaberHumLoop();
      }
    }

    // ゲームプレイ中のみ SFX / 環境パラメータ更新
    if (!audioActive) return;

    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const forward = camera.getWorldDirection(listenerForward.current);
    audioEngine.updateListener({
      position: { x: cx, y: cy, z: cz },
      forward: { x: forward.x, y: forward.y, z: forward.z },
      up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    });

    const mobs = useMobStore.getState().mobs;
    const hostileCount = mobs.reduce(
      (count, mob) => count + (!mob.isAlly && mob.type !== 'chicken' ? 1 : 0),
      0,
    );
    const bossActive = mobs.some((mob) => mob.type === 'boss_giant');
    const modeState = useModeFlowStore.getState();
    const modeRule = getStageModeRule(gameState.currentStage?.id);
    const modeFlowRatio = modeRule ? modeState.meter / modeRule.threshold : 0;
    updateBGMScene({
      biome: gameState.currentStage?.biome,
      category: gameState.currentStage?.category ?? null,
      dimension: gameState.dimension,
      isNight: gameState.isNight,
      combatIntensity: Math.min(1, hostileCount / 5 + modeFlowRatio * 0.32),
      bossActive,
    });

    // --- 初回の位置初期化 ---
    if (!initialized.current) {
      lastCameraPos.current = { x: cx, y: cy, z: cz };
      initialized.current = true;

      // BGMと環境音を開始
      if (!bgmStarted.current) {
        bgmStarted.current = true;
        startBGM();
        initAmbientSounds();
      }
      return;
    }

    // --- プレイヤーの水平速度を推定 ---
    const dx = cx - lastCameraPos.current.x;
    const dy = cy - lastCameraPos.current.y;
    const dz = cz - lastCameraPos.current.z;
    const horizontalSpeed = Math.sqrt(dx * dx + dz * dz) / dt;
    const verticalVelocity = dy / dt;
    const verticalSpeed = Math.abs(verticalVelocity);
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

    const blockX = Math.floor(cx);
    const blockZ = Math.floor(cz);
    const footY = Math.floor(cy - PLAYER_EYE_OFFSET - 0.06);
    let groundBlock = useWorldStore.getState().getBlock(blockX, footY, blockZ);
    if (groundBlock === BLOCK_IDS.AIR) {
      groundBlock = useWorldStore.getState().getBlock(blockX, footY - 1, blockZ);
    }
    const footstepSurface = resolveFootstepSurface(groundBlock, gameState.currentStage?.biome);
    if (canPlayFootstep && horizontalSpeed > FOOTSTEP_MIN_SPEED) {
      footstepDistance.current += Math.sqrt(dx * dx + dz * dz);
      const running = horizontalSpeed > 6.2;
      const stride = running ? FOOTSTEP_RUN_STRIDE : FOOTSTEP_WALK_STRIDE;
      if (footstepDistance.current >= stride) {
        playSurfaceFootstep(
          footstepSurface,
          running ? 'run' : 'walk',
          Math.min(1.28, horizontalSpeed / 5.5),
        );
        footstepDistance.current %= stride;
      }
    } else {
      // 止まった後の初動が無音にならないよう、次の一歩までの距離を短く保つ。
      footstepDistance.current = Math.min(footstepDistance.current, FOOTSTEP_WALK_STRIDE * 0.62);
    }

    // --- モブの非言語音 ---
    const activeMobIds = new Set<string>();
    for (const mob of mobs) {
      activeMobIds.add(mob.id);
      const mdx = mob.x - cx;
      const mdy = mob.y - cy;
      const mdz = mob.z - cz;
      const distance = Math.sqrt(mdx * mdx + mdy * mdy + mdz * mdz);
      const position = { x: mob.x, y: mob.y + 0.8, z: mob.z };
      const nearDistance = mob.type === 'boss_giant' ? 30 : mob.type === 'chicken' ? 7 : 14;
      const near = distance <= nearDistance;
      const attackActive = mob.attackTimer > 0.04;
      const hpRatio = mob.maxHp > 0 ? mob.hp / mob.maxHp : 0;
      const previous = mobAudioSnapshots.current.get(mob.id);

      if (!previous) {
        if (distance <= (mob.type === 'boss_giant' ? 48 : 34)) {
          playCreatureCue(mob.type, 'spawn', { position, entityId: mob.id, gain: 0.9 });
        }
      } else {
        if (!previous.near && near) {
          playCreatureCue(mob.type, 'alert', { position, entityId: mob.id });
        }
        if (!previous.attackActive && attackActive) {
          playCreatureCue(mob.type, 'attack', { position, entityId: mob.id });
        }
        if (mob.hitTimer > previous.hitTimer + 0.025) {
          playCreatureCue(mob.type, 'hurt', { position, entityId: mob.id });
        }
        if (mob.type === 'boss_giant') {
          const crossedPhase = (previous.hpRatio > 0.66 && hpRatio <= 0.66)
            || (previous.hpRatio > 0.33 && hpRatio <= 0.33);
          if (crossedPhase) {
            playCreatureCue(mob.type, 'special', { position, entityId: mob.id, gain: 1.08 });
          }
        }
      }

      mobAudioSnapshots.current.set(mob.id, { attackActive, hitTimer: mob.hitTimer, hpRatio, near });
    }
    for (const id of mobAudioSnapshots.current.keys()) {
      if (!activeMobIds.has(id)) mobAudioSnapshots.current.delete(id);
    }

    for (const type of Object.keys(CREATURE_IDLE_INTERVALS) as MobType[]) {
      const remaining = (creatureIdleTimers.current.get(type) ?? randomIdleInterval(type)) - dt;
      if (remaining > 0) {
        creatureIdleTimers.current.set(type, remaining);
        continue;
      }
      let closest: (typeof mobs)[number] | null = null;
      let closestDistance = Infinity;
      for (const mob of mobs) {
        if (mob.type !== type) continue;
        const mdx = mob.x - cx;
        const mdy = mob.y - cy;
        const mdz = mob.z - cz;
        const distance = Math.sqrt(mdx * mdx + mdy * mdy + mdz * mdz);
        const audibleDistance = type === 'boss_giant' ? 48 : type === 'chicken' ? 16 : 28;
        if (distance < audibleDistance && distance < closestDistance) {
          closest = mob;
          closestDistance = distance;
        }
      }
      if (closest) {
        playCreatureCue(type, 'idle', {
          position: { x: closest.x, y: closest.y + 0.8, z: closest.z },
          entityId: closest.id,
        });
      }
      creatureIdleTimers.current.set(type, randomIdleInterval(type));
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
    audioEngine.setEnvironment({
      underwater: isUnderwater,
      underground: isUnderground,
      dimension: gameState.dimension,
    });
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
      gameState.dimension,
    );
  });

  return null;
}
