// 武器・アイテム熟練度ストア
// 使う、当てる、倒す、作る行動を積み上げて、遊び続ける動機を作る

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { EquippedItem } from './usePlayerStore';
import { isMasteryPerkUpgradeLevel } from '../types/masteryPerks';
import {
  formatMasteryTechniqueBonus,
  getMasteryTechniqueBonus,
  getMasteryTechniqueProgress,
} from '../types/masteryTechniquePerks';
import { playLevelUpSound, playPerkUnlockSound, playXPGainSound } from '../utils/sounds';

export type MasteryEventKind =
  | 'use'
  | 'hit'
  | 'defeat'
  | 'block_break'
  | 'block_place'
  | 'mine_ore'
  | 'summon'
  | 'detonate';

export type BuilderMasteryAction =
  | 'block_break'
  | 'block_place'
  | 'mine_ore'
  | 'summon'
  | 'detonate';

export interface MasteryItemState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalXp: number;
  uses: number;
  hits: number;
  defeats: number;
  blocksChanged: number;
  techniqueActivations: number;
  bestTechniqueScore: number;
  bestTechniqueLabel: string;
  bestTechniqueStreak: number;
  lastLeveledAt: number;
}

export interface MasteryEvent {
  id: number;
  item: EquippedItem;
  kind: MasteryEventKind;
  label: string;
  xp: number;
  level: number;
  leveledUp: boolean;
  critical: boolean;
  streak: number;
  techniqueRecordUpdated: boolean;
  techniqueTierUnlocked: boolean;
  techniqueTier: number;
  techniqueTierLabel: string;
  techniqueBonusLabel: string;
  createdAt: number;
}

export interface MasteryRecordOptions {
  amount?: number;
  label?: string;
  critical?: boolean;
}

export interface MasteryDefinition {
  icon: string;
  label: string;
  shortLabel: string;
  accent: string;
  glow: string;
  actionLabel: string;
  titles: Array<{ level: number; title: string }>;
}

type MasteryItems = Record<EquippedItem, MasteryItemState>;
type MasteryStatDeltas = Partial<Pick<MasteryItemState, 'uses' | 'hits' | 'defeats' | 'blocksChanged'>>;

const STREAK_WINDOW_MS = 3600;
const RECENT_COMBAT_WINDOW_MS = 6500;

export const MASTERY_DEFS: Record<EquippedItem, MasteryDefinition> = {
  builder: {
    icon: '⛏️',
    label: '建築',
    shortLabel: 'BUILD',
    accent: '#9bdcff',
    glow: 'rgba(108, 196, 255, 0.26)',
    actionLabel: '作るほど世界が広がる',
    titles: [
      { level: 1, title: '見習いビルダー' },
      { level: 3, title: '素材あつめ名人' },
      { level: 6, title: '街づくり職人' },
      { level: 10, title: 'ワールド設計士' },
    ],
  },
  rocket_launcher: {
    icon: '🚀',
    label: 'ロケット',
    shortLabel: 'BLAST',
    accent: '#ffc06d',
    glow: 'rgba(255, 135, 58, 0.28)',
    actionLabel: 'まとめて吹き飛ばす',
    titles: [
      { level: 1, title: '花火係' },
      { level: 3, title: '爆風ランナー' },
      { level: 6, title: '包囲突破隊長' },
      { level: 10, title: 'ボス破壊王' },
    ],
  },
  machine_gun: {
    icon: '🔫',
    label: '機関銃',
    shortLabel: 'BURST',
    accent: '#ffe28a',
    glow: 'rgba(255, 220, 90, 0.24)',
    actionLabel: '狙い続けて押し返す',
    titles: [
      { level: 1, title: '連射ビギナー' },
      { level: 3, title: 'トレーサー使い' },
      { level: 6, title: '防衛シューター' },
      { level: 10, title: '弾幕マスター' },
    ],
  },
  lightsaber: {
    icon: '⚔️',
    label: 'ライトセイバー',
    shortLabel: 'COMBO',
    accent: '#c8b0ff',
    glow: 'rgba(170, 130, 255, 0.28)',
    actionLabel: 'コンボで切り開く',
    titles: [
      { level: 1, title: '光の見習い' },
      { level: 3, title: 'コンボ剣士' },
      { level: 6, title: '閃光ブレイカー' },
      { level: 10, title: '銀河の守り手' },
    ],
  },
  gravity_glove: {
    icon: '🧤',
    label: '引力グローブ',
    shortLabel: 'PULL',
    accent: '#9d8cff',
    glow: 'rgba(140, 120, 255, 0.3)',
    actionLabel: '引き寄せて押し飛ばす',
    titles: [
      { level: 1, title: '引力ビギナー' },
      { level: 3, title: '引き寄せ名人' },
      { level: 6, title: '重力使い' },
      { level: 10, title: '空間をねじる手' },
    ],
  },
  bomb_slinger: {
    icon: '💣',
    label: 'ボムスリンガー',
    shortLabel: 'BOMB',
    accent: '#ff8a6a',
    glow: 'rgba(255, 120, 80, 0.3)',
    actionLabel: '仕掛けて一気に爆発',
    titles: [
      { level: 1, title: 'ボム投げ見習い' },
      { level: 3, title: '時限仕掛け人' },
      { level: 6, title: '爆破プランナー' },
      { level: 10, title: 'ドカンの達人' },
    ],
  },
};

function getNowMs(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function createInitialMasteryItem(): MasteryItemState {
  return {
    level: 1,
    xp: 0,
    xpToNextLevel: getMasteryXpToNextLevel(1),
    totalXp: 0,
    uses: 0,
    hits: 0,
    defeats: 0,
    blocksChanged: 0,
    techniqueActivations: 0,
    bestTechniqueScore: 0,
    bestTechniqueLabel: '',
    bestTechniqueStreak: 0,
    lastLeveledAt: 0,
  };
}

function createInitialMasteryItems(): MasteryItems {
  return {
    builder: createInitialMasteryItem(),
    rocket_launcher: createInitialMasteryItem(),
    machine_gun: createInitialMasteryItem(),
    lightsaber: createInitialMasteryItem(),
    gravity_glove: createInitialMasteryItem(),
    bomb_slinger: createInitialMasteryItem(),
  };
}

export function getMasteryXpToNextLevel(level: number): number {
  return 45 + level * 28 + Math.floor(level ** 1.35 * 12);
}

export function getMasteryProgress(item: MasteryItemState): number {
  if (item.xpToNextLevel <= 0) return 0;
  return Math.max(0, Math.min(1, item.xp / item.xpToNextLevel));
}

export function getMasteryTitle(item: EquippedItem, level: number): string {
  const titles = MASTERY_DEFS[item].titles;
  let current = titles[0]?.title ?? MASTERY_DEFS[item].label;
  for (const title of titles) {
    if (level >= title.level) current = title.title;
  }
  return current;
}

function isCombatKind(kind: MasteryEventKind): boolean {
  return kind === 'use' || kind === 'hit' || kind === 'defeat';
}

function isTechniqueActivation(kind: MasteryEventKind, streak: number, critical: boolean): boolean {
  if (critical || kind === 'defeat' || kind === 'detonate' || kind === 'summon') return true;
  if (kind === 'block_place' || kind === 'block_break') return streak >= 8;
  if (kind === 'hit') return streak >= 5;
  return false;
}

function getTechniqueScore(kind: MasteryEventKind, xp: number, streak: number, critical: boolean): number {
  const kindBonus = kind === 'defeat'
    ? 18
    : kind === 'detonate' || kind === 'summon'
      ? 14
      : kind === 'hit'
        ? 8
        : 0;
  return Math.max(0, Math.round(xp + streak * 3 + kindBonus + (critical ? 16 : 0)));
}

interface MasteryState {
  items: MasteryItems;
  recentEvent: MasteryEvent | null;
  eventSequence: number;
  streakItem: EquippedItem | null;
  streakCount: number;
  lastActionAt: number;
  lastCombatItem: EquippedItem | null;
  lastCombatAt: number;
  recordItemUse: (item: EquippedItem, options?: MasteryRecordOptions) => void;
  recordItemHit: (item: EquippedItem, options?: MasteryRecordOptions) => void;
  recordItemDefeat: (item?: EquippedItem | null, options?: MasteryRecordOptions) => void;
  recordBuilderAction: (action: BuilderMasteryAction, options?: MasteryRecordOptions) => void;
  getRecentCombatItem: (maxAgeMs?: number) => EquippedItem | null;
  clearRecentEvent: () => void;
  resetRuntime: () => void;
}

export const useMasteryStore = create<MasteryState>()(
  persist(
    (set, get) => {
      const recordProgress = (
        item: EquippedItem,
        kind: MasteryEventKind,
        baseXp: number,
        fallbackLabel: string,
        statDeltas: MasteryStatDeltas,
        options?: MasteryRecordOptions,
      ) => {
        const state = get();
        const now = getNowMs();
        const streak = state.streakItem === item && now - state.lastActionAt <= STREAK_WINDOW_MS
          ? state.streakCount + 1
          : 1;
        const streakBonus = streak >= 3 ? Math.min(10, Math.floor(streak / 3) * 2) : 0;
        const criticalBonus = options?.critical ? 4 : 0;
        const gainedXp = Math.max(1, Math.round((options?.amount ?? baseXp) + streakBonus + criticalBonus));
        const current = state.items[item] ?? createInitialMasteryItem();
        const eventLabel = options?.label ?? fallbackLabel;
        const techniqueScore = getTechniqueScore(kind, gainedXp, streak, Boolean(options?.critical));
        const techniqueActivation = isTechniqueActivation(kind, streak, Boolean(options?.critical));
        const techniqueRecordUpdated = techniqueActivation && techniqueScore > (current.bestTechniqueScore ?? 0);
        const previousTechniqueTier = getMasteryTechniqueProgress(item, current).currentTier;

        let nextLevel = current.level;
        let nextXp = current.xp + gainedXp;
        let nextXpToLevel = current.xpToNextLevel || getMasteryXpToNextLevel(nextLevel);
        let leveledUp = false;

        while (nextXp >= nextXpToLevel) {
          nextXp -= nextXpToLevel;
          nextLevel += 1;
          nextXpToLevel = getMasteryXpToNextLevel(nextLevel);
          leveledUp = true;
        }

        const nextItem: MasteryItemState = {
          ...current,
          level: nextLevel,
          xp: nextXp,
          xpToNextLevel: nextXpToLevel,
          totalXp: current.totalXp + gainedXp,
          uses: current.uses + (statDeltas.uses ?? 0),
          hits: current.hits + (statDeltas.hits ?? 0),
          defeats: current.defeats + (statDeltas.defeats ?? 0),
          blocksChanged: current.blocksChanged + (statDeltas.blocksChanged ?? 0),
          techniqueActivations: (current.techniqueActivations ?? 0) + (techniqueActivation ? 1 : 0),
          bestTechniqueScore: techniqueRecordUpdated
            ? techniqueScore
            : (current.bestTechniqueScore ?? 0),
          bestTechniqueLabel: techniqueRecordUpdated
            ? eventLabel
            : (current.bestTechniqueLabel ?? ''),
          bestTechniqueStreak: Math.max(current.bestTechniqueStreak ?? 0, streak),
          lastLeveledAt: leveledUp ? now : current.lastLeveledAt,
        };
        const nextTechniqueBonus = getMasteryTechniqueBonus(item, nextItem);
        const nextTechniqueProgress = getMasteryTechniqueProgress(item, nextItem);
        const techniqueTierUnlocked = nextTechniqueProgress.currentTier > previousTechniqueTier;
        const nextSequence = state.eventSequence + 1;
        const nextEvent: MasteryEvent = {
          id: nextSequence,
          item,
          kind,
          label: eventLabel,
          xp: gainedXp,
          level: nextLevel,
          leveledUp,
          critical: Boolean(options?.critical),
          streak,
          techniqueRecordUpdated,
          techniqueTierUnlocked,
          techniqueTier: nextTechniqueProgress.currentTier,
          techniqueTierLabel: nextTechniqueBonus.tierLabel,
          techniqueBonusLabel: formatMasteryTechniqueBonus(item, nextTechniqueBonus),
          createdAt: now,
        };
        const nextItems: MasteryItems = {
          ...state.items,
          [item]: nextItem,
        };

        set({
          items: nextItems,
          recentEvent: nextEvent,
          eventSequence: nextSequence,
          streakItem: item,
          streakCount: streak,
          lastActionAt: now,
          lastCombatItem: isCombatKind(kind) ? item : state.lastCombatItem,
          lastCombatAt: isCombatKind(kind) ? now : state.lastCombatAt,
        });

        if (techniqueTierUnlocked) {
          playPerkUnlockSound();
        } else if (leveledUp) {
          if (isMasteryPerkUpgradeLevel(item, nextLevel)) {
            playPerkUnlockSound();
          } else {
            playLevelUpSound();
          }
        } else if (kind === 'defeat' || streak >= 3) {
          playXPGainSound();
        }
      };

      return {
        items: createInitialMasteryItems(),
        recentEvent: null,
        eventSequence: 0,
        streakItem: null,
        streakCount: 0,
        lastActionAt: 0,
        lastCombatItem: null,
        lastCombatAt: 0,

        recordItemUse: (item, options) => {
          recordProgress(
            item,
            'use',
            item === 'builder' ? 1 : 2,
            item === 'rocket_launcher'
              ? 'ロケット発射'
              : item === 'machine_gun'
                ? '機関銃射撃'
                : item === 'lightsaber'
                  ? 'コンボ開始'
                  : '道具使用',
            { uses: 1 },
            options,
          );
        },

        recordItemHit: (item, options) => {
          recordProgress(
            item,
            'hit',
            options?.critical ? 12 : 8,
            options?.critical ? '会心ヒット' : '命中',
            { hits: 1 },
            options,
          );
        },

        recordItemDefeat: (item, options) => {
          const creditedItem = item ?? get().getRecentCombatItem();
          if (!creditedItem) return;
          recordProgress(
            creditedItem,
            'defeat',
            24,
            '敵をたおした',
            { defeats: 1 },
            options,
          );
        },

        recordBuilderAction: (action, options) => {
          const config: Record<BuilderMasteryAction, {
            xp: number;
            label: string;
            deltas: MasteryStatDeltas;
          }> = {
            block_break: { xp: 5, label: 'ブロック破壊', deltas: { uses: 1, blocksChanged: 1 } },
            block_place: { xp: 4, label: 'ブロック設置', deltas: { uses: 1, blocksChanged: 1 } },
            mine_ore: { xp: 15, label: '鉱石発見', deltas: { uses: 1, blocksChanged: 1 } },
            summon: { xp: 18, label: 'ゴーレム召喚', deltas: { uses: 1, blocksChanged: 1 } },
            detonate: { xp: 16, label: 'TNT起爆', deltas: { uses: 1, blocksChanged: 1 } },
          };
          const next = config[action];
          recordProgress('builder', action, next.xp, next.label, next.deltas, options);
        },

        getRecentCombatItem: (maxAgeMs = RECENT_COMBAT_WINDOW_MS) => {
          const state = get();
          const now = getNowMs();
          if (!state.lastCombatItem) return null;
          if (now - state.lastCombatAt > maxAgeMs) return null;
          return state.lastCombatItem;
        },

        clearRecentEvent: () => set({ recentEvent: null }),

        resetRuntime: () => set({
          recentEvent: null,
          streakItem: null,
          streakCount: 0,
          lastActionAt: 0,
          lastCombatItem: null,
          lastCombatAt: 0,
        }),
      };
    },
    {
      name: 'halcraft-mastery-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<MasteryState, 'items'>>;
        const mergedItems = { ...current.items };
        for (const item of Object.keys(current.items) as EquippedItem[]) {
          mergedItems[item] = {
            ...createInitialMasteryItem(),
            ...current.items[item],
            ...(persistedState.items?.[item] ?? {}),
          };
        }
        return {
          ...current,
          items: mergedItems,
        };
      },
    },
  ),
);
