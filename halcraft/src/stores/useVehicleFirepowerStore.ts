// 乗り物火力の命中手応えを管理するストア
// 戦車・飛行機の攻撃を、照準HUD・トースト・SEで同じ意味にそろえる

import { create } from 'zustand';
import type { VehicleType } from './useVehicleStore';
import { playVehicleFirepowerSound, type VehicleFirepowerSoundKind } from '../utils/sounds';

export type VehicleFirepowerKind = 'gatling' | 'cannon' | 'bomb';

export interface VehicleFirepowerEvent {
  id: string;
  vehicleType: VehicleType;
  kind: VehicleFirepowerKind;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
  meterText: string;
  chain: number;
  gain: number;
  critical: boolean;
  accent: string;
  glow: string;
  celebration: boolean;
  createdAt: number;
}

interface RecordStrikeInput {
  vehicleType: VehicleType;
  kind: VehicleFirepowerKind;
  amount?: number;
  critical?: boolean;
  modeGain?: number;
}

interface VehicleFirepowerState {
  chain: number;
  bestChain: number;
  chainExpiresAt: number;
  recentEvent: VehicleFirepowerEvent | null;
  recordStrike: (input: RecordStrikeInput) => VehicleFirepowerEvent;
  clearRecentEvent: (id?: string) => void;
}

const CHAIN_WINDOW_MS = 2800;
const CELEBRATION_CHAIN_MARKS = new Set([3, 6, 10]);
let vehicleFirepowerSequence = 0;

function nowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function getVehicleCopy(vehicleType: VehicleType, kind: VehicleFirepowerKind): {
  icon: string;
  vehicleLabel: string;
  attackLabel: string;
  accent: string;
  glow: string;
} {
  if (vehicleType === 'airplane') {
    return {
      icon: kind === 'bomb' ? '💣' : '✈️',
      vehicleLabel: '飛行機',
      attackLabel: kind === 'bomb' ? '空爆命中' : '機銃命中',
      accent: '#75dfff',
      glow: 'rgba(90, 220, 255, 0.34)',
    };
  }

  if (vehicleType === 'tank') {
    return {
      icon: kind === 'cannon' ? '💥' : '🛞',
      vehicleLabel: '戦車',
      attackLabel: kind === 'cannon' ? '主砲命中' : 'ガトリング命中',
      accent: '#ffc06d',
      glow: 'rgba(255, 180, 90, 0.34)',
    };
  }

  return {
    icon: '⚙️',
    vehicleLabel: '乗り物',
    attackLabel: '火力命中',
    accent: '#d7f6ff',
    glow: 'rgba(160, 220, 255, 0.28)',
  };
}

function getSoundKind(chain: number, critical: boolean): VehicleFirepowerSoundKind {
  if (critical || chain >= 6) return 'critical';
  if (chain >= 3) return 'chain';
  return 'hit';
}

function shouldCelebrate(chain: number, critical: boolean): boolean {
  if (critical) return true;
  if (CELEBRATION_CHAIN_MARKS.has(chain)) return true;
  return chain > 0 && chain % 8 === 0;
}

export const useVehicleFirepowerStore = create<VehicleFirepowerState>((set, get) => ({
  chain: 0,
  bestChain: 0,
  chainExpiresAt: 0,
  recentEvent: null,

  recordStrike: (input) => {
    const createdAt = nowMs();
    const amount = Math.max(1, Math.round(input.amount ?? 1));
    const state = get();
    const nextChain = createdAt <= state.chainExpiresAt
      ? state.chain + amount
      : amount;
    const bestChain = Math.max(state.bestChain, nextChain);
    const copy = getVehicleCopy(input.vehicleType, input.kind);
    const modeGain = Math.max(0, Math.round(input.modeGain ?? 0));
    const critical = input.critical ?? false;
    const celebration = shouldCelebrate(nextChain, critical);
    const meterText = modeGain > 0 ? `戦意 +${modeGain}` : `HIT x${nextChain}`;
    const event: VehicleFirepowerEvent = {
      id: `vehicle-firepower-${vehicleFirepowerSequence++}`,
      vehicleType: input.vehicleType,
      kind: input.kind,
      icon: copy.icon,
      eyebrow: critical
        ? '乗り物火力 / 会心'
        : nextChain >= 3
          ? '乗り物火力チェーン'
          : '乗り物火力',
      title: nextChain >= 3
        ? `${copy.attackLabel} x${nextChain}`
        : copy.attackLabel,
      detail: modeGain > 0
        ? `${copy.vehicleLabel}の命中が砂漠の戦意へつながった`
        : `${copy.vehicleLabel}の命中チェーンを継続中`,
      meterText,
      chain: nextChain,
      gain: modeGain,
      critical,
      accent: copy.accent,
      glow: copy.glow,
      celebration,
      createdAt,
    };

    playVehicleFirepowerSound(getSoundKind(nextChain, critical));
    set({
      chain: nextChain,
      bestChain,
      chainExpiresAt: createdAt + CHAIN_WINDOW_MS,
      recentEvent: event,
    });
    return event;
  },

  clearRecentEvent: (id) => {
    set((state) => {
      if (id && state.recentEvent?.id !== id) return state;
      return { recentEvent: null };
    });
  },
}));
