// エフェクト管理ストア
// アクティブなバフ/デバフエフェクトの追加・更新・削除を管理

import { create } from 'zustand';
import {
  type EffectType,
  type ActiveEffect,
  type PotionId,
  POTION_DEFS,
  EFFECT_INFO,
} from '../types/potions';
import { playPotionDrinkSound, playEffectExpireSound } from '../utils/sounds';

interface EffectState {
  /** アクティブなエフェクト一覧 */
  effects: ActiveEffect[];

  /** ポーションを使用（エフェクトを追加） */
  usePotion: (potionId: PotionId) => void;

  /** エフェクトを直接追加 */
  addEffect: (type: EffectType, level: number, duration: number) => void;

  /** 指定エフェクトを除去 */
  removeEffect: (type: EffectType) => void;

  /** 全エフェクトをクリア */
  clearEffects: () => void;

  /** 毎フレーム更新（dt秒） */
  updateEffects: (dt: number) => void;

  /** 指定エフェクトがアクティブか */
  hasEffect: (type: EffectType) => boolean;

  /** 指定エフェクトのレベルを取得（0=なし） */
  getEffectLevel: (type: EffectType) => number;
}

export const useEffectStore = create<EffectState>((set, get) => ({
  effects: [],

  usePotion: (potionId) => {
    const def = POTION_DEFS[potionId];
    if (!def) return;
    playPotionDrinkSound();
    get().addEffect(def.effect, def.level, def.duration);
  },

  addEffect: (type, level, duration) => {
    const info = EFFECT_INFO[type];
    set((state) => {
      // 同種エフェクトがあれば上書き（より強い/長い方を優先）
      const existing = state.effects.find((e) => e.type === type);
      if (existing) {
        const updated = state.effects.map((e) =>
          e.type === type
            ? {
                ...e,
                level: Math.max(e.level, level),
                remainingTime: Math.max(e.remainingTime, duration),
                totalDuration: Math.max(e.totalDuration, duration),
              }
            : e,
        );
        return { effects: updated };
      }
      // 新規追加
      return {
        effects: [
          ...state.effects,
          {
            type,
            level,
            remainingTime: duration,
            totalDuration: duration,
            color: info.color,
            emoji: info.emoji,
          },
        ],
      };
    });
  },

  removeEffect: (type) => {
    set((state) => ({
      effects: state.effects.filter((e) => e.type !== type),
    }));
  },

  clearEffects: () => {
    set({ effects: [] });
  },

  updateEffects: (dt) => {
    const { effects } = get();
    if (effects.length === 0) return;

    const updated: ActiveEffect[] = [];
    let changed = false;
    for (const effect of effects) {
      const remaining = effect.remainingTime - dt;
      if (remaining <= 0) {
        // エフェクト終了
        playEffectExpireSound();
        changed = true;
      } else {
        if (remaining !== effect.remainingTime) changed = true;
        updated.push({ ...effect, remainingTime: remaining });
      }
    }
    if (changed) {
      set({ effects: updated });
    }
  },

  hasEffect: (type) => {
    return get().effects.some((e) => e.type === type);
  },

  getEffectLevel: (type) => {
    const effect = get().effects.find((e) => e.type === type);
    return effect?.level ?? 0;
  },
}));
