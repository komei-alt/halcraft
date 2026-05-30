// ステージ別の時間イベント定義
// ただ待つだけの時間を、マップごとの補給・気候・戦闘テンポに変える

import { BLOCK_DEFS, BLOCK_IDS, type BlockId } from './blocks';
import { getStageById } from './stages';

export type StageEventSoundKind = 'forest' | 'tropical' | 'snow' | 'desert' | 'war' | 'rocket';

export interface StageEventBlockReward {
  blockId: BlockId;
  count: number;
}

export interface StageEventEffect {
  blocks: StageEventBlockReward[];
  heal: number;
  hunger: number;
  rocketReady: boolean;
  shieldMs: number;
}

export interface StageEventDefinition {
  id: string;
  stageId: string;
  icon: string;
  title: string;
  detail: string;
  label: string;
  accent: string;
  firstTriggerSeconds: number;
  repeatEverySeconds: number;
  activeDurationMs: number;
  sound: StageEventSoundKind;
  effect: StageEventEffect;
}

const EMPTY_EFFECT: StageEventEffect = {
  blocks: [],
  heal: 0,
  hunger: 0,
  rocketReady: false,
  shieldMs: 0,
};

function effect(overrides: Partial<StageEventEffect>): StageEventEffect {
  return {
    ...EMPTY_EFFECT,
    ...overrides,
    blocks: overrides.blocks ?? [],
  };
}

function shortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('木の', '木')
    .replace('グロウストーン', '光る石');
}

function formatBlocks(blocks: StageEventBlockReward[]): string {
  return blocks
    .filter((block) => block.count > 0)
    .map((block) => `${shortBlockName(block.blockId)} +${block.count}`)
    .join(' / ');
}

function formatEffectLabel(effectValue: StageEventEffect, fallback: string): string {
  const parts = [
    formatBlocks(effectValue.blocks),
    effectValue.heal > 0 ? `HP +${effectValue.heal}` : '',
    effectValue.hunger > 0 ? `満腹 +${effectValue.hunger}` : '',
    effectValue.rocketReady ? 'ロケット即応' : '',
    effectValue.shieldMs > 0 ? `安全 +${Math.round(effectValue.shieldMs / 1000)}s` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' / ') : fallback;
}

const STAGE_EVENTS_BASE: Omit<StageEventDefinition, 'label'>[] = [
  {
    id: 'forest-craft-bloom',
    stageId: 'build-forest',
    icon: '🌿',
    title: '木漏れ日の制作時間',
    detail: '森が明るくなり、木と葉の素材がまとまって届く。',
    accent: '#b7ff72',
    firstTriggerSeconds: 52,
    repeatEverySeconds: 96,
    activeDurationMs: 6200,
    sound: 'forest',
    effect: effect({
      blocks: [
        { blockId: BLOCK_IDS.WOOD, count: 10 },
        { blockId: BLOCK_IDS.LEAVES, count: 10 },
      ],
    }),
  },
  {
    id: 'tropical-tide-supply',
    stageId: 'build-tropical',
    icon: '🌊',
    title: '潮風のリゾート便',
    detail: '水辺づくりが進み、ガラスと水の補給が流れ込む。',
    accent: '#65fff2',
    firstTriggerSeconds: 48,
    repeatEverySeconds: 92,
    activeDurationMs: 6200,
    sound: 'tropical',
    effect: effect({
      blocks: [
        { blockId: BLOCK_IDS.GLASS, count: 10 },
        { blockId: BLOCK_IDS.WATER, count: 8 },
      ],
      hunger: 1,
    }),
  },
  {
    id: 'snow-beacon-glow',
    stageId: 'build-snow',
    icon: '✨',
    title: '雪明かりの補給',
    detail: '吹雪の中で目印が光り、城づくりの光る素材が届く。',
    accent: '#d8f6ff',
    firstTriggerSeconds: 58,
    repeatEverySeconds: 104,
    activeDurationMs: 6600,
    sound: 'snow',
    effect: effect({
      blocks: [
        { blockId: BLOCK_IDS.GLOWSTONE, count: 4 },
        { blockId: BLOCK_IDS.GLASS, count: 8 },
      ],
      heal: 1,
    }),
  },
  {
    id: 'desert-caravan-haul',
    stageId: 'build-desert',
    icon: '🏜️',
    title: '砂漠キャラバン',
    detail: '砂風が資材を運び、大きな建築を一気に続けやすくなる。',
    accent: '#ffd27a',
    firstTriggerSeconds: 50,
    repeatEverySeconds: 88,
    activeDurationMs: 6200,
    sound: 'desert',
    effect: effect({
      blocks: [
        { blockId: BLOCK_IDS.SAND, count: 18 },
        { blockId: BLOCK_IDS.STONE, count: 6 },
      ],
    }),
  },
  {
    id: 'forest-watch-fire',
    stageId: 'war-forest',
    icon: '🛡️',
    title: '見張り火の防衛補給',
    detail: '森の拠点が守りを固め、HPとタレットが少し戻る。',
    accent: '#dce775',
    firstTriggerSeconds: 42,
    repeatEverySeconds: 84,
    activeDurationMs: 5600,
    sound: 'war',
    effect: effect({
      blocks: [{ blockId: BLOCK_IDS.TURRET, count: 1 }],
      heal: 3,
      shieldMs: 4500,
    }),
  },
  {
    id: 'tropical-rush-crate',
    stageId: 'war-tropical',
    icon: '💥',
    title: '強襲クレート',
    detail: 'ジャングルの前線にTNT補給が落ち、押し返すきっかけが生まれる。',
    accent: '#ffe28a',
    firstTriggerSeconds: 38,
    repeatEverySeconds: 78,
    activeDurationMs: 5400,
    sound: 'war',
    effect: effect({
      blocks: [{ blockId: BLOCK_IDS.TNT, count: 2 }],
      hunger: 2,
    }),
  },
  {
    id: 'snow-front-campfire',
    stageId: 'war-snow',
    icon: '🔥',
    title: '極寒キャンプ補給',
    detail: '雪の前線に焚き火と回復が届き、持久戦を立て直せる。',
    accent: '#c8b0ff',
    firstTriggerSeconds: 46,
    repeatEverySeconds: 98,
    activeDurationMs: 6200,
    sound: 'snow',
    effect: effect({
      blocks: [{ blockId: BLOCK_IDS.CAMPFIRE, count: 1 }],
      heal: 4,
      shieldMs: 3500,
    }),
  },
  {
    id: 'desert-rocket-window',
    stageId: 'war-desert',
    icon: '🚀',
    title: '熱砂の火力窓',
    detail: '砂漠の視界が開け、ロケットと爆発で攻めるタイミングが来る。',
    accent: '#ffc06d',
    firstTriggerSeconds: 40,
    repeatEverySeconds: 82,
    activeDurationMs: 5400,
    sound: 'rocket',
    effect: effect({
      blocks: [{ blockId: BLOCK_IDS.TNT, count: 2 }],
      rocketReady: true,
    }),
  },
];

export const STAGE_EVENTS: Record<string, StageEventDefinition> = Object.fromEntries(
  STAGE_EVENTS_BASE.map((eventDef) => [
    eventDef.stageId,
    {
      ...eventDef,
      label: formatEffectLabel(eventDef.effect, eventDef.title),
    },
  ]),
) as Record<string, StageEventDefinition>;

export function getStageEvent(stageId: string | null | undefined): StageEventDefinition | null {
  if (!stageId || !getStageById(stageId)) return null;
  return STAGE_EVENTS[stageId] ?? null;
}
