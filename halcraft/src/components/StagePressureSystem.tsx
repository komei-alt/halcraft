// ステージ環境プレッシャーの実プレイ処理
// 雪・砂漠などを、説明だけでなく消耗と避難行動で差別化する

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useStagePressureStore } from '../stores/useStagePressureStore';
import { useWorldStore } from '../stores/useWorldStore';
import {
  getStagePressure,
  getStagePressureSeverity,
  getStagePressureTimeMultiplier,
  isStagePressureShelterBlock,
  type StagePressureDefinition,
  type StagePressureSeverity,
} from '../types/stagePressures';
import { playStagePressureSound } from '../utils/sounds';

const UPDATE_INTERVAL_MS = 240;
const DAMAGE_INTERVAL_MS = 950;
const MOVEMENT_RISE_BONUS = 0.35;
const PRESSURE_EPSILON = 0.003;
const PLAYER_FOOT_OFFSET = 1.5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function findNearbyShelter(
  definition: StagePressureDefinition,
  getBlock: ReturnType<typeof useWorldStore.getState>['getBlock'],
  centerX: number,
  centerY: number,
  centerZ: number,
): boolean {
  const radius = definition.safeRadius;
  const verticalRadius = definition.verticalRadius;

  for (let y = centerY - verticalRadius; y <= centerY + verticalRadius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        const dx = x - centerX;
        const dz = z - centerZ;
        if (dx * dx + dz * dz > radius * radius) continue;
        if (isStagePressureShelterBlock(definition, getBlock(x, y, z))) {
          return true;
        }
      }
    }
  }

  return false;
}

function getStatusLabel(
  definition: StagePressureDefinition,
  severity: StagePressureSeverity,
  isSheltered: boolean,
  timeMultiplier: number,
): string {
  if (timeMultiplier <= 0) return '今はおだやか';
  if (isSheltered) return definition.safeLabel;
  if (severity === 'safe') return definition.protectLabel;
  return definition.dangerLabel;
}

function shouldPlayWarning(previous: StagePressureSeverity, next: StagePressureSeverity): boolean {
  if (next === 'safe' || next === 'watch') return false;
  return previous !== next;
}

/** 戦争マップごとの暑さ・寒さ・暗がりを、消耗と避難行動として反映する */
export function StagePressureSystem() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const gameTime = useGameStore((s) => s.gameTime);
  const getBlock = useWorldStore((s) => s.getBlock);
  const lastUpdateAt = useRef(0);
  const lastDamageAt = useRef(0);
  const pressureRef = useRef(0);
  const severityRef = useRef<StagePressureSeverity>('safe');
  const lastPositionRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const now = performance.now();
    if (now - lastUpdateAt.current < UPDATE_INTERVAL_MS) return;
    const dt = Math.min(1, Math.max(UPDATE_INTERVAL_MS / 1000, (now - lastUpdateAt.current) / 1000));
    lastUpdateAt.current = now;

    const definition = getStagePressure(stage?.id);
    if (phase !== 'playing' || isBuildMode || !definition) {
      if (pressureRef.current > 0 || useStagePressureStore.getState().stageId !== null) {
        pressureRef.current = 0;
        severityRef.current = 'safe';
        useStagePressureStore.getState().reset();
      }
      lastPositionRef.current.copy(camera.position);
      return;
    }

    const footX = Math.floor(camera.position.x);
    const footY = Math.floor(camera.position.y - PLAYER_FOOT_OFFSET);
    const footZ = Math.floor(camera.position.z);
    const playerState = usePlayerStore.getState();
    const timeMultiplier = getStagePressureTimeMultiplier(definition, gameTime);
    const nearShelter = findNearbyShelter(definition, getBlock, footX, footY, footZ);
    const waterShelter = definition.waterRelief && playerState.isInWater;
    const isSheltered = timeMultiplier <= 0 || nearShelter || waterShelter;
    const movedDistance = camera.position.distanceTo(lastPositionRef.current);
    const movementMultiplier = movedDistance > 0.9 ? 1 + MOVEMENT_RISE_BONUS : 1;

    const nextPressure = isSheltered
      ? clamp01(pressureRef.current - definition.recoverPerSecond * dt)
      : clamp01(
          pressureRef.current
            + definition.risePerSecond * timeMultiplier * movementMultiplier * dt,
        );
    pressureRef.current = nextPressure;

    if (!isSheltered && nextPressure > PRESSURE_EPSILON) {
      const exhaustion = definition.hungerExhaustionPerSecond * nextPressure * timeMultiplier * dt;
      if (exhaustion > 0) {
        usePlayerStore.setState((state) => ({
          hungerExhaustion: state.hungerExhaustion + exhaustion,
        }));
      }
    }

    if (
      !isSheltered &&
      nextPressure >= definition.damageThreshold &&
      now - lastDamageAt.current >= DAMAGE_INTERVAL_MS
    ) {
      lastDamageAt.current = now;
      playerState.takeDamage(definition.damagePerSecond);
    }

    const severity = getStagePressureSeverity(nextPressure);
    if (
      (severity === 'danger' || severity === 'critical') &&
      shouldPlayWarning(severityRef.current, severity)
    ) {
      playStagePressureSound(definition.kind, severity);
    }
    severityRef.current = severity;
    lastPositionRef.current.copy(camera.position);

    useStagePressureStore.getState().setSnapshot({
      stageId: definition.stageId,
      kind: definition.kind,
      title: definition.title,
      pressure: nextPressure,
      severity,
      isSheltered,
      timeMultiplier,
      statusLabel: getStatusLabel(definition, severity, isSheltered, timeMultiplier),
      updatedAt: now,
    });
  });

  return null;
}
