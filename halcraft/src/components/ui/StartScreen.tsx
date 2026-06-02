// スタート画面コンポーネント
// ハルが描いたタイトル画像を背景に使用
// 名前入力 + カテゴリ→ステージ2段選択 + クリック/タップでゲーム開始
// デバイスに応じて操作説明を切り替え
// スマホ縦・横両対応（スクロール可能）

import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { isTouchDevice, requestFullscreen } from '../../utils/device';
import { activateDesktopGameplayInput } from '../../utils/gameCanvas';
import { initAudio } from '../../utils/sounds';
import { initPushIfPWA } from '../../utils/pushNotifications';
import { InstallBanner } from './mobile/InstallBanner';
import { UpdateLog } from './UpdateLog';
import { SkinSelector } from './SkinSelector';
import { STAGES, type StageCategory, type StageDefinition } from '../../types/stages';
import {
  getStageChallenges,
  getStageChallengeMedal,
  getStageChallengeMedalLabel,
  type StageChallengeDefinition,
} from '../../types/stageChallenges';
import { getStageCondition } from '../../types/stageConditions';
import { getStagePressure } from '../../types/stagePressures';
import { getStageEvent } from '../../types/stageEvents';
import { formatStageBossReward, getStageBossEncounter } from '../../types/stageBossEncounters';
import { formatStageBuildFocus, getStageBuildStyle } from '../../types/stageBuildStyles';
import {
  formatStageMasteryPerkLabel,
  getStageMasteryPerk,
  getStageMasterySummary,
  type StageMasteryPerk,
  type StageMasterySummary,
} from '../../types/stageMastery';
import {
  formatStageRunBonusLabel,
  getStageOpeningItemLabel,
  getStageRunBonusForProgress,
  type StageRunBonus,
} from '../../types/stageRunBonuses';
import { formatStageHotbarPreview, getStageStarterHotbarItemCounts } from '../../types/stageHotbars';
import { formatStageCombatBonus, getStageCombatStyle, getStageCombatWeaponLabel } from '../../types/stageCombatStyles';
import { formatStageEnemyProfile, getStageEnemyProfile } from '../../types/stageEnemyProfiles';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getStageRecordGoal, type StageRecordGoal } from '../../types/stageRecordGoals';
import { getStageSignatureAward, type StageSignatureAward } from '../../types/stageSignatureAwards';
import {
  formatStageSignaturePerkLabel,
  getStageSignaturePerkForAward,
  type StageSignaturePerk,
} from '../../types/stageSignaturePerks';
import { getModeFlowRankLabel } from '../../stores/useModeFlowStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { BLOCK_DEFS, type BlockId } from '../../types/blocks';
import { TOOL_DEFS, type ToolId } from '../../types/tools';
import { SG } from './startScreenTheme';

/** localStorage のキー */
const PLAYER_NAME_KEY = 'halcraft-player-name';
const SELECTED_STAGE_KEY = 'halcraft-selected-stage';
const SELECTED_CATEGORY_KEY = 'halcraft-selected-category';

/** カテゴリ定義 */
const CATEGORIES: Array<{
  id: StageCategory;
  name: string;
  icon: string;
  caption: string;
  color: string;
  glowColor: string;
}> = [
  {
    id: 'build',
    name: '建築',
    icon: '🏗️',
    caption: '平和な世界で自由に建築',
    color: 'rgba(80, 170, 255, 0.36)',
    glowColor: 'rgba(100,190,255,0.34)',
  },
  {
    id: 'war',
    name: '戦争',
    icon: '⚔️',
    caption: 'モブと戦いサバイバル',
    color: 'rgba(220, 60, 40, 0.36)',
    glowColor: 'rgba(220,80,60,0.34)',
  },
];

interface StarterBlockPreview {
  blockId: BlockId;
  count: number;
}

/** ブリーフィングの情報グループ（同じ箱の羅列をやめ、意味でゾーン分けする） */
type BriefingGroup = 'rule' | 'style' | 'loadout';

interface StageBriefingSection {
  title: string;
  value: string;
  details: string[];
  accent: string;
  group: BriefingGroup;
}

interface StagePrepCue {
  icon: string;
  label: string;
  value: string;
  detail: string;
  accent: string;
}

interface StageSceneryProfile {
  sky: string;
  ground: string;
  far: string;
  mid: string;
  near: string;
  water?: string;
  particles: string;
  mood: string;
}

/** グループの表示順とラベル（ゾーンの見出し） */
const BRIEFING_GROUPS: Array<{
  id: BriefingGroup;
  label: string;
  icon: string;
  tint: string;
}> = [
  { id: 'rule', label: 'このマップのルール', icon: '📜', tint: 'rgba(130, 200, 255, 0.95)' },
  { id: 'style', label: '戦い方・つくり方', icon: '⚔️', tint: 'rgba(255, 150, 110, 0.95)' },
  { id: 'loadout', label: 'もちもの', icon: '🎒', tint: 'rgba(255, 224, 130, 0.98)' },
];

const STAGE_SCENERY: Record<string, StageSceneryProfile> = {
  'build-forest': {
    sky: 'linear-gradient(180deg, #8fd7ff 0%, #d9f6ff 52%, #9ee789 100%)',
    ground: 'linear-gradient(180deg, #5ebf5e 0%, #2e7d3d 100%)',
    far: '#245c32',
    mid: '#3d9852',
    near: '#b8f06c',
    particles: 'rgba(225,255,145,0.72)',
    mood: '森の木かげ',
  },
  'build-tropical': {
    sky: 'linear-gradient(180deg, #78e8ff 0%, #e4fff6 48%, #93e9be 100%)',
    ground: 'linear-gradient(180deg, #f7d482 0%, #56c58f 100%)',
    far: '#16708b',
    mid: '#2fcf9f',
    near: '#fff0a6',
    water: 'linear-gradient(90deg, #5df4ff, #7affd2)',
    particles: 'rgba(255,255,255,0.78)',
    mood: '海と島',
  },
  'build-snow': {
    sky: 'linear-gradient(180deg, #b7d7ff 0%, #f9feff 54%, #dceeff 100%)',
    ground: 'linear-gradient(180deg, #f8feff 0%, #adcbe9 100%)',
    far: '#8bb1d2',
    mid: '#d8f2ff',
    near: '#ffffff',
    particles: 'rgba(255,255,255,0.86)',
    mood: '雪山の光',
  },
  'build-desert': {
    sky: 'linear-gradient(180deg, #ffd092 0%, #fff0bf 52%, #f2bd67 100%)',
    ground: 'linear-gradient(180deg, #f6bf69 0%, #bb7a37 100%)',
    far: '#c58b47',
    mid: '#f2ad5a',
    near: '#fff0a6',
    particles: 'rgba(255,227,154,0.75)',
    mood: '砂丘の熱気',
  },
  'war-forest': {
    sky: 'linear-gradient(180deg, #6ca8c6 0%, #264f3a 55%, #142419 100%)',
    ground: 'linear-gradient(180deg, #436b37 0%, #172415 100%)',
    far: '#12321e',
    mid: '#46602c',
    near: '#ffad63',
    particles: 'rgba(255,180,96,0.72)',
    mood: '森の防衛戦',
  },
  'war-tropical': {
    sky: 'linear-gradient(180deg, #62d6e8 0%, #2a6f72 55%, #162a24 100%)',
    ground: 'linear-gradient(180deg, #54b47d 0%, #16392d 100%)',
    far: '#0c5470',
    mid: '#23b995',
    near: '#ffcf67',
    water: 'linear-gradient(90deg, #44dbff, #7cf0c4)',
    particles: 'rgba(255,210,120,0.76)',
    mood: '海辺の制圧',
  },
  'war-snow': {
    sky: 'linear-gradient(180deg, #8cb6e6 0%, #526a8d 52%, #172139 100%)',
    ground: 'linear-gradient(180deg, #dfefff 0%, #546f8d 100%)',
    far: '#6e91b4',
    mid: '#c7ebff',
    near: '#8df7ff',
    particles: 'rgba(220,250,255,0.82)',
    mood: '吹雪の迎撃',
  },
  'war-desert': {
    sky: 'linear-gradient(180deg, #ffab62 0%, #7e3f24 58%, #20100d 100%)',
    ground: 'linear-gradient(180deg, #d58a45 0%, #5c2b1c 100%)',
    far: '#a76632',
    mid: '#ff9b4f',
    near: '#ffef87',
    particles: 'rgba(255,180,92,0.8)',
    mood: '熱砂の決戦',
  },
};

function getStageScenery(stage: StageDefinition): StageSceneryProfile {
  return STAGE_SCENERY[stage.id] ?? STAGE_SCENERY[`${stage.category}-${stage.biome}`] ?? STAGE_SCENERY['build-forest'];
}

function TerrainLayer({
  color,
  top,
  height,
  opacity,
  points,
  delay,
  duration,
}: {
  color: string;
  top: number;
  height: number;
  opacity: number;
  points: string;
  delay: number;
  duration: number;
}) {
  return (
    <span
      aria-hidden
      className="stage-scenery-preview__terrain"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: top,
        height,
        background: color,
        opacity,
        clipPath: `polygon(${points})`,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    />
  );
}

function StageSceneryPreview({
  stage,
  compact,
  large = false,
}: {
  stage: StageDefinition;
  compact: boolean;
  large?: boolean;
}) {
  const scenery = getStageScenery(stage);
  const height = large ? (compact ? 72 : 92) : (compact ? 42 : 52);
  const style: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    overflow: 'hidden',
    borderRadius: large ? 14 : 7,
    border: `1px solid ${stage.color}55`,
    backgroundImage: scenery.sky,
    backgroundSize: '118% 100%',
    boxShadow: large
      ? `inset 0 1px 0 rgba(255,255,255,0.2), 0 0 22px ${stage.color}22`
      : `inset 0 1px 0 rgba(255,255,255,0.16), 0 0 10px ${stage.color}18`,
  };

  const particleCount = large ? 8 : 5;
  const stationCount = large ? 5 : 3;
  const isWar = stage.category === 'war';

  return (
    <div aria-label={`${stage.name}の景色プレビュー`} className="stage-scenery-preview" style={style}>
      <span
        aria-hidden
        className="stage-scenery-preview__light"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.18), transparent 44%, rgba(0,0,0,0.26))',
        }}
      />
      <TerrainLayer
        color={scenery.far}
        top={height * 0.32}
        height={height * 0.26}
        opacity={0.44}
        points="0 70%, 9% 42%, 18% 64%, 29% 28%, 42% 68%, 56% 35%, 70% 62%, 84% 24%, 100% 64%, 100% 100%, 0 100%"
        delay={-1.2}
        duration={large ? 9.5 : 10.5}
      />
      <TerrainLayer
        color={scenery.mid}
        top={height * 0.18}
        height={height * 0.34}
        opacity={0.68}
        points="0 58%, 11% 35%, 22% 52%, 36% 20%, 49% 55%, 62% 30%, 76% 56%, 90% 26%, 100% 48%, 100% 100%, 0 100%"
        delay={-3.4}
        duration={large ? 7.5 : 8.6}
      />
      <span
        aria-hidden
        className="stage-scenery-preview__terrain"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * 0.34,
          background: scenery.ground,
          clipPath: 'polygon(0 42%, 15% 25%, 29% 34%, 43% 16%, 58% 30%, 74% 12%, 100% 28%, 100% 100%, 0 100%)',
          animationDelay: '-2.1s',
          animationDuration: large ? '6.4s' : '7.2s',
        }}
      />
      {scenery.water && (
        <span
          aria-hidden
          className="stage-scenery-preview__water"
          style={{
            position: 'absolute',
            left: '8%',
            right: '7%',
            bottom: height * 0.23,
            height: Math.max(4, height * 0.08),
            borderRadius: 999,
            backgroundImage: scenery.water,
            backgroundSize: '180% 100%',
            opacity: 0.7,
            boxShadow: '0 0 16px rgba(120,255,235,0.38)',
          }}
        />
      )}
      {Array.from({ length: stationCount }).map((_, i) => {
        const x = 12 + i * (large ? 17 : 26);
        const towerHeight = height * (isWar ? 0.2 + (i % 2) * 0.05 : 0.15 + (i % 2) * 0.04);
        return (
          <span
            key={`stage-scenery-marker-${stage.id}-${i}`}
            aria-hidden
            className="stage-scenery-preview__marker"
            style={{
              position: 'absolute',
              left: `${x}%`,
              bottom: height * 0.28,
              width: isWar ? 3 : 4,
              height: towerHeight,
              borderRadius: isWar ? 1 : 999,
              background: isWar ? scenery.near : scenery.mid,
              boxShadow: `0 0 ${large ? 10 : 7}px ${scenery.near}66`,
              transform: isWar ? 'skewX(-8deg)' : 'none',
              animationDelay: `${-0.45 * i}s`,
            }}
          />
        );
      })}
      {Array.from({ length: particleCount }).map((_, i) => (
        <span
          key={`stage-scenery-particle-${stage.id}-${i}`}
          aria-hidden
          className="stage-scenery-preview__particle"
          style={{
            position: 'absolute',
            left: `${9 + i * (large ? 11 : 17)}%`,
            top: `${18 + ((i * 13) % 30)}%`,
            width: large ? 15 : 9,
            height: 2,
            borderRadius: 999,
            background: scenery.particles,
            opacity: 0.7,
            transform: `rotate(${i % 2 === 0 ? -10 : 8}deg)`,
            boxShadow: `0 0 ${large ? 12 : 8}px ${scenery.particles}`,
            animationDelay: `${-0.35 * i}s`,
          }}
        />
      ))}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 8,
          bottom: 6,
          maxWidth: '72%',
          padding: large ? '3px 8px' : '2px 6px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.34)',
          color: 'rgba(255,255,255,0.82)',
          fontSize: large ? (compact ? 8 : 10) : 8,
          fontWeight: 900,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 1px 3px rgba(0,0,0,0.75)',
        }}
      >
        {scenery.mood}
      </span>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: 7,
          top: 6,
          color: stage.color,
          fontSize: large ? (compact ? 13 : 16) : 12,
          filter: `drop-shadow(0 0 8px ${stage.color})`,
        }}
      >
        {stage.icon}
      </span>
    </div>
  );
}

function loadCategory(): StageCategory {
  try {
    const saved = localStorage.getItem(SELECTED_CATEGORY_KEY);
    if (saved === 'build' || saved === 'war') return saved;
  } catch { /* noop */ }
  return 'build';
}

function extractStagePlayerCounts(payload: unknown): Record<string, number> | null {
  if (!payload || typeof payload !== 'object') return null;

  const { stages } = payload as { stages?: unknown };
  if (!Array.isArray(stages)) return null;

  const counts: Record<string, number> = {};
  for (const stage of stages) {
    if (!stage || typeof stage !== 'object') return null;

    const { id, playerCount } = stage as {
      id?: unknown;
      playerCount?: unknown;
    };

    if (typeof id !== 'string' || typeof playerCount !== 'number' || !Number.isFinite(playerCount)) {
      return null;
    }

    counts[id] = playerCount;
  }

  return counts;
}

function getShortBlockName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? `ID${blockId}`)
    .replace('ブロック', '')
    .replace('草付き土', '草')
    .replace('生の木', '原木')
    .replace('グロウストーン', '光る石')
    .replace('電気の', '電気');
}

function formatRunTime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '未記録';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function getStarterBlockPreview(stage: StageDefinition, limit: number): StarterBlockPreview[] {
  return Object.entries(stage.rules.starterKit.blocks)
    .map(([rawBlockId, rawCount]) => ({
      blockId: Number(rawBlockId) as BlockId,
      count: rawCount ?? 0,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function getStarterToolLabels(tools: ToolId[], equippedToolId: ToolId | null, limit: number): string[] {
  return [...tools]
    .sort((a, b) => {
      if (a === equippedToolId) return -1;
      if (b === equippedToolId) return 1;
      return a.localeCompare(b);
    })
    .slice(0, limit)
    .map((toolId) => {
      const tool = TOOL_DEFS[toolId];
      if (!tool) return toolId;
      return toolId === equippedToolId ? `${tool.emoji} ${tool.name}装備` : `${tool.emoji} ${tool.name}`;
    });
}

function getChallengeTargetText(metric: string, target: number): string {
  switch (metric) {
    case 'enemies_defeated':
      return `${target}体`;
    case 'boss_defeated':
      return 'ボス';
    case 'machine_gun_hits':
    case 'rocket_hits':
    case 'lightsaber_hits':
      return `${target}hit`;
    case 'detonations':
      return `${target}回`;
    default:
      return `${target}個`;
  }
}

function getEnemyPreview(stage: StageDefinition): string[] {
  const tuning = stage.rules.enemyTuning;
  const profile = getStageEnemyProfile(stage.id);
  const bossEncounter = getStageBossEncounter(stage.id);
  if (!tuning) {
    return [
      '敵なし / 建築に集中',
      `昼の長さ ${Math.round(stage.rules.dayDurationSeconds / 60)}分`,
      `目印: ${stage.rules.landmarkName}`,
    ];
  }

  const xpLabel = tuning.xpMultiplier === 1
    ? 'XP 標準'
    : `XP +${Math.round((tuning.xpMultiplier - 1) * 100)}%`;

  return [
    profile ? `${profile.icon} ${formatStageEnemyProfile(profile)}` : '敵編成 標準',
    `敵上限 ${tuning.maxHostileMobs}体`,
    `ゾンビ${tuning.zombieIntervalSeconds.toFixed(1)}秒 / クモ${tuning.spiderIntervalSeconds.toFixed(1)}秒`,
    bossEncounter
      ? `ボス ${tuning.bossAfterDefeats}体で${bossEncounter.title}`
      : `ボス ${tuning.bossAfterDefeats}体撃破で出現`,
    xpLabel,
  ];
}

function getStageBriefingSections(
  stage: StageDefinition,
  condition: ReturnType<typeof getStageCondition>,
  pressure: ReturnType<typeof getStagePressure>,
  event: ReturnType<typeof getStageEvent>,
  runBonus: StageRunBonus | null,
  masteryPerk: StageMasteryPerk | null,
  signaturePerk: StageSignaturePerk | null,
  challenges: ReturnType<typeof getStageChallenges>,
  completedCount: number,
  challengeCount: number,
  signatureAward: StageSignatureAward,
  compact: boolean,
): StageBriefingSection[] {
  const blockPreview = getStarterBlockPreview(stage, compact ? 3 : 4)
    .map((entry) => `${getShortBlockName(entry.blockId)}x${entry.count}`);
  const toolPreview = getStarterToolLabels(
    stage.rules.starterKit.tools,
    stage.rules.starterKit.equippedToolId,
    compact ? 1 : 2,
  );
  const hotbarPreview = formatStageHotbarPreview(
    stage.id,
    getStageStarterHotbarItemCounts(stage, runBonus, masteryPerk, signaturePerk),
    compact ? 3 : 4,
  );
  const challengePreview = challenges
    .slice(0, compact ? 2 : 3)
    .map((challenge) => `${challenge.icon} ${challenge.title} ${getChallengeTargetText(challenge.metric, challenge.target)}`);

  const sections: StageBriefingSection[] = [
    {
      title: '目的',
      value: stage.rules.objective.title,
      details: [
        stage.rules.objective.targetCount
          ? `${stage.rules.objective.targetCount}体撃破でクリア`
          : '自由建築 / つくるほど成長',
        stage.rules.objective.prompts.slice(0, compact ? 2 : 3).join('・'),
      ],
      accent: stage.color,
      group: 'rule',
    },
    {
      title: 'マップ特性',
      value: condition ? condition.title : stage.rules.landmarkName,
      details: condition
        ? [
            `${condition.triggerLabel}を${condition.target}回`,
            `${condition.effect.label} / ${Math.round(condition.activeDurationMs / 1000)}秒`,
          ]
        : [stage.rules.shortPitch],
      accent: condition?.accent ?? stage.color,
      group: 'rule',
    },
  ];

  if (pressure) {
    sections.push({
      title: '環境',
      value: `${pressure.icon} ${pressure.title}`,
      details: [
        pressure.dangerLabel,
        pressure.protectLabel,
      ],
      accent: pressure.accent,
      group: 'rule',
    });
  }

  if (event) {
    sections.push({
      title: 'イベント',
      value: `${event.icon} ${event.title}`,
      details: [
        `${event.firstTriggerSeconds}秒後 / ${event.repeatEverySeconds}秒ごと`,
        event.label,
      ],
      accent: event.accent,
      group: 'rule',
    });
  }

  const buildStyle = getStageBuildStyle(stage.id);
  const modeRule = getStageModeRule(stage.id);
  if (modeRule) {
    sections.push({
      title: 'モードルール',
      value: `${modeRule.icon} ${modeRule.shortLabel}`,
      details: compact
        ? [
            modeRule.actionLabel,
            formatStageModeReward(modeRule),
          ]
        : [
            modeRule.detail,
            `発動: ${formatStageModeReward(modeRule)}`,
          ],
      accent: modeRule.accent,
      group: 'rule',
    });
  }

  if (buildStyle) {
    sections.push({
      title: '作品評価',
      value: `${buildStyle.icon} ${buildStyle.title}`,
      details: [
        formatStageBuildFocus(buildStyle, compact ? 3 : 4),
        buildStyle.detail,
      ],
      accent: buildStyle.accent,
      group: 'style',
    });
  }

  const combatStyle = getStageCombatStyle(stage.id);
  if (combatStyle) {
    sections.push({
      title: '戦闘スタイル',
      value: `${combatStyle.icon} ${combatStyle.title}`,
      details: [
        formatStageCombatBonus(combatStyle),
        combatStyle.detail,
      ],
      accent: combatStyle.accent,
      group: 'style',
    });
  }

  const enemyProfile = getStageEnemyProfile(stage.id);
  if (enemyProfile) {
    sections.push({
      title: '敵編成',
      value: `${enemyProfile.icon} ${enemyProfile.title}`,
      details: [
        formatStageEnemyProfile(enemyProfile),
        ...getEnemyPreview(stage).slice(1, compact ? 2 : 3),
      ],
      accent: enemyProfile.accent,
      group: 'style',
    });
  }

  const bossEncounter = getStageBossEncounter(stage.id);
  if (bossEncounter) {
    sections.push({
      title: 'ボス戦',
      value: `${bossEncounter.icon} ${bossEncounter.title}`,
      details: compact
        ? [
            bossEncounter.weakness,
            bossEncounter.rewardLabel,
          ]
        : [
            bossEncounter.detail,
            `弱点: ${bossEncounter.weakness}`,
            `報酬: ${formatStageBossReward(bossEncounter)}`,
          ],
      accent: bossEncounter.accent,
      group: 'style',
    });
  }

  sections.push({
    title: 'マップ称号',
    value: `${signatureAward.icon} ${signatureAward.title}`,
    details: [
      signatureAward.requirementLabel,
      signatureAward.unlocked ? '獲得済み / 最高記録を更新しよう' : signatureAward.nextLabel,
    ],
    accent: signatureAward.accent,
    group: 'style',
  });

  sections.push({
    title: 'チャレンジ',
    value: `${completedCount}/${challengeCount} 達成`,
    details: challengePreview.length > 0 ? challengePreview : ['クリアでメダル獲得'],
    accent: 'rgba(150, 230, 255, 0.95)',
    group: 'style',
  });

  sections.push(
    {
      title: '支給品',
      value: blockPreview.join(' / '),
      details: [
        `開始: ${getStageOpeningItemLabel(stage.id)}`,
        `1-9: ${hotbarPreview}`,
        ...(toolPreview.length > 0 ? toolPreview : ['手ぶらで開始']),
      ],
      accent: 'rgba(255, 230, 128, 0.95)',
      group: 'loadout',
    },
  );

  if (runBonus) {
    sections.push({
      title: runBonus.sourceLabel,
      value: `${runBonus.icon} ${runBonus.title}`,
      details: [
        runBonus.shortLabel,
        formatStageRunBonusLabel(runBonus),
      ],
      accent: runBonus.accent,
      group: 'loadout',
    });
  }

  if (masteryPerk) {
    sections.push({
      title: 'マップ熟練特典',
      value: `${masteryPerk.icon} ${masteryPerk.title}`,
      details: [
        masteryPerk.shortLabel,
        formatStageMasteryPerkLabel(masteryPerk),
      ],
      accent: masteryPerk.accent,
      group: 'loadout',
    });
  }

  if (signaturePerk) {
    sections.push({
      title: 'マップ称号特典',
      value: `${signaturePerk.icon} ${signaturePerk.title}`,
      details: [
        signaturePerk.detail,
        formatStageSignaturePerkLabel(signaturePerk),
      ],
      accent: signaturePerk.accent,
      group: 'loadout',
    });
  }

  return sections;
}

function getFirstUnfinishedChallenge(
  challenges: StageChallengeDefinition[],
  completedIds: string[] | undefined,
): StageChallengeDefinition | null {
  const completedSet = new Set(completedIds ?? []);
  return challenges.find((challenge) => !completedSet.has(challenge.id)) ?? challenges[0] ?? null;
}

function getStagePrepCues(args: {
  stage: StageDefinition;
  recordGoal: StageRecordGoal;
  challenges: StageChallengeDefinition[];
  completedIds?: string[];
  runBonus: StageRunBonus | null;
  masteryPerk: StageMasteryPerk | null;
  signatureAward: StageSignatureAward;
  signaturePerk: StageSignaturePerk | null;
}): StagePrepCue[] {
  const {
    stage,
    recordGoal,
    challenges,
    completedIds,
    runBonus,
    masteryPerk,
    signatureAward,
    signaturePerk,
  } = args;
  const modeRule = getStageModeRule(stage.id);
  const challenge = getFirstUnfinishedChallenge(challenges, completedIds);
  const cues: StagePrepCue[] = [
    {
      icon: recordGoal.icon,
      label: '今回のねらい',
      value: recordGoal.title,
      detail: recordGoal.detail,
      accent: recordGoal.accent,
    },
    {
      icon: signatureAward.icon,
      label: signatureAward.unlocked ? '獲得称号' : 'マップ称号',
      value: signatureAward.title,
      detail: `${signatureAward.nextLabel} / ${signatureAward.progressLabel}`,
      accent: signatureAward.accent,
    },
  ];

  if (stage.category === 'war') {
    const combatStyle = getStageCombatStyle(stage.id);
    cues.push({
      icon: combatStyle?.icon ?? '⚔️',
      label: '推奨装備',
      value: combatStyle ? getStageCombatWeaponLabel(combatStyle.weapon) : '武器を切替',
      detail: combatStyle
        ? `${combatStyle.shortLabel}: ${formatStageCombatBonus(combatStyle)}`
        : modeRule?.actionLabel ?? stage.rules.objective.prompts[0] ?? stage.rules.objective.title,
      accent: combatStyle?.accent ?? modeRule?.accent ?? stage.color,
    });
  } else {
    const buildStyle = getStageBuildStyle(stage.id);
    cues.push({
      icon: buildStyle?.icon ?? '🧱',
      label: 'つくり方',
      value: buildStyle?.shortLabel ?? 'テーマ建築',
      detail: modeRule?.actionLabel ?? buildStyle?.focusLabel ?? stage.rules.objective.prompts[0] ?? stage.rules.objective.title,
      accent: buildStyle?.accent ?? modeRule?.accent ?? stage.color,
    });
  }

  cues.push({
    icon: signaturePerk?.icon ?? challenge?.icon ?? runBonus?.icon ?? masteryPerk?.icon ?? '🎁',
    label: signaturePerk ? '称号特典' : challenge ? '寄り道チャレンジ' : runBonus ? '開始特典' : '熟練特典',
    value: signaturePerk?.title ?? challenge?.title ?? runBonus?.shortLabel ?? masteryPerk?.shortLabel ?? 'マップを極める',
    detail: signaturePerk
      ? formatStageSignaturePerkLabel(signaturePerk)
      : challenge?.description
      ?? (runBonus ? formatStageRunBonusLabel(runBonus) : null)
      ?? (masteryPerk ? formatStageMasteryPerkLabel(masteryPerk) : null)
      ?? stage.rules.objective.description,
    accent: signaturePerk?.accent ?? challenge?.accent ?? runBonus?.accent ?? masteryPerk?.accent ?? stage.color,
  });

  return cues;
}

/** セクションの STEP 見出し（番号バッジ＋ラベル）。子供にも手順が伝わるよう番号を振る */
function StepLabel({ n, text, accent, compact }: { n: number; text: string; accent: string; compact: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? 19 : 22,
          height: compact ? 19 : 22,
          borderRadius: 999,
          background: accent,
          color: '#0a0e14',
          fontWeight: 900,
          fontSize: compact ? 11 : 12,
          boxShadow: `0 0 14px ${accent}88`,
          fontFamily: SG.font,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <span
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontWeight: 800,
          fontSize: compact ? 12 : 14,
          letterSpacing: 2,
          textShadow: '0 1px 6px rgba(0,0,0,0.85)',
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const setStage = useGameStore((s) => s.setStage);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);
  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const connectionMessage = useMultiplayerStore((s) => s.connectionMessage);
  const bestByStage = useStageChallengeStore((s) => s.bestByStage);
  const buildBestByStage = useStageBuildScoreStore((s) => s.bestByStage);

  const [name, setName] = useState(() => {
    try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch { return ''; }
  });
  const [selectedCategory, setSelectedCategory] = useState<StageCategory>(loadCategory);
  const [selectedStageId, setSelectedStageId] = useState(() => {
    try { return localStorage.getItem(SELECTED_STAGE_KEY) || STAGES[0].id; } catch { return STAGES[0].id; }
  });
  const [isJoining, setIsJoining] = useState(false);
  const [stagePlayerCounts, setStagePlayerCounts] = useState<Record<string, number>>({});

  const isTouch = isTouchDevice();
  const isValidName = name.trim().length >= 1 && name.trim().length <= 8;

  // カテゴリに属するステージをフィルタ
  const filteredStages = useMemo(
    () => STAGES.filter(s => s.category === selectedCategory),
    [selectedCategory],
  );

  // カテゴリ切替直後は、stateを書き換えずに表示・開始対象だけを先頭ステージへ補正する
  const activeStageId = useMemo(() => {
    if (filteredStages.some(s => s.id === selectedStageId)) return selectedStageId;
    return filteredStages[0]?.id ?? selectedStageId;
  }, [filteredStages, selectedStageId]);

  const activeStage = useMemo(
    () => filteredStages.find((stage) => stage.id === activeStageId) ?? filteredStages[0] ?? STAGES[0],
    [activeStageId, filteredStages],
  );

  // ビューポートサイズを追跡（UpdateLog 表示判定＋レイアウト切り替え用）
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // UpdateLog を表示するか: タッチデバイスでない＆十分な画面幅＆十分な画面高さ
  const showUpdateLog = useMemo(
    () => !isTouch && viewportSize.w >= 900 && viewportSize.h >= 500,
    [isTouch, viewportSize.w, viewportSize.h],
  );

  // 横画面かどうか（高さが極端に低い）
  const isLandscapeMobile = viewportSize.h < 500 && viewportSize.w > viewportSize.h;
  const compactLayout = isTouch || viewportSize.w < 560;
  const showDesktopLaunchDock = showUpdateLog && !compactLayout;
  const briefingColumns = viewportSize.w < 380
    ? '1fr'
    : compactLayout || (showUpdateLog && viewportSize.w < 1100)
      ? 'repeat(2, minmax(0, 1fr))'
      : 'repeat(4, minmax(0, 1fr))';
  const briefingPanelWidth = isTouch
    ? 'min(100%, 340px)'
    : showUpdateLog
      ? 'min(760px, calc(100vw - 420px))'
      : 'min(820px, calc(100vw - 48px))';
  const activeCondition = useMemo(() => getStageCondition(activeStage.id), [activeStage.id]);
  const activePressure = useMemo(() => getStagePressure(activeStage.id), [activeStage.id]);
  const activeEvent = useMemo(() => getStageEvent(activeStage.id), [activeStage.id]);
  const activeChallenges = useMemo(() => getStageChallenges(activeStage.id), [activeStage.id]);
  const activeChallengeCount = activeChallenges.length;
  const activeCompletedCount = bestByStage[activeStage.id]?.completedCount ?? 0;
  const activeRunBest = bestByStage[activeStage.id];
  const activeMedal = getStageChallengeMedal(activeCompletedCount, activeChallengeCount);
  const activeMedalLabel = getStageChallengeMedalLabel(activeMedal);
  const activeBuildBest = buildBestByStage[activeStage.id];
  const stageMasteries = useMemo<Record<string, StageMasterySummary>>(
    () => Object.fromEntries(STAGES.map((stage) => {
      const challenges = getStageChallenges(stage.id);
      const best = bestByStage[stage.id];
      const buildBest = buildBestByStage[stage.id];
      return [
        stage.id,
        getStageMasterySummary({
          stage,
          completedCount: best?.completedCount ?? 0,
          challengeCount: challenges.length,
          buildScore: buildBest?.score ?? 0,
        }),
      ];
    })),
    [bestByStage, buildBestByStage],
  );
  const activeMastery = stageMasteries[activeStage.id]
    ?? getStageMasterySummary({
      stage: activeStage,
      completedCount: activeCompletedCount,
      challengeCount: activeChallengeCount,
      buildScore: buildBestByStage[activeStage.id]?.score ?? 0,
    });
  const categoryMasteries = filteredStages.map((stage) => stageMasteries[stage.id]).filter(Boolean);
  const categoryAverageMastery = categoryMasteries.length > 0
    ? Math.round(categoryMasteries.reduce((sum, mastery) => sum + mastery.score, 0) / categoryMasteries.length)
    : 0;
  const categoryMasteredCount = categoryMasteries.filter((mastery) => mastery.mastered).length;
  const activeRunBonus = useMemo(
    () => getStageRunBonusForProgress(activeStage.id, activeMedal, activeBuildBest?.score ?? 0),
    [activeBuildBest?.score, activeStage.id, activeMedal],
  );
  const activeMasteryPerk = useMemo(
    () => getStageMasteryPerk(activeStage, activeMastery),
    [activeMastery, activeStage],
  );
  const activeRecordGoal = useMemo(
    () => getStageRecordGoal({
      stage: activeStage,
      runBest: activeRunBest,
      buildBest: activeBuildBest,
    }),
    [activeBuildBest, activeRunBest, activeStage],
  );
  const activeSignatureAward = useMemo(
    () => getStageSignatureAward({
      stage: activeStage,
      runBest: activeRunBest,
      buildBest: activeBuildBest,
    }),
    [activeBuildBest, activeRunBest, activeStage],
  );
  const activeSignaturePerk = useMemo(
    () => getStageSignaturePerkForAward(activeStage, activeSignatureAward),
    [activeSignatureAward, activeStage],
  );
  const activeBriefingSections = useMemo(
    () => getStageBriefingSections(
      activeStage,
      activeCondition,
      activePressure,
      activeEvent,
      activeRunBonus,
      activeMasteryPerk,
      activeSignaturePerk,
      activeChallenges,
      activeCompletedCount,
      activeChallengeCount,
      activeSignatureAward,
      compactLayout,
    ),
    [
      activeStage,
      activeCondition,
      activePressure,
      activeEvent,
      activeRunBonus,
      activeMasteryPerk,
      activeSignaturePerk,
      activeChallenges,
      activeCompletedCount,
      activeChallengeCount,
      activeSignatureAward,
      compactLayout,
    ],
  );
  const activePrepCues = useMemo(
    () => getStagePrepCues({
      stage: activeStage,
      recordGoal: activeRecordGoal,
      challenges: activeChallenges,
      completedIds: activeRunBest?.completedIds,
      runBonus: activeRunBonus,
      masteryPerk: activeMasteryPerk,
      signatureAward: activeSignatureAward,
      signaturePerk: activeSignaturePerk,
    }),
    [
      activeChallenges,
      activeMasteryPerk,
      activeSignaturePerk,
      activeRecordGoal,
      activeRunBest?.completedIds,
      activeRunBonus,
      activeStage,
      activeSignatureAward,
    ],
  );

  // 進捗バンド「あなたの記録」に出す値（戦争=BESTタイム / 建築=作品スコア）
  const isWarStage = activeStage.category === 'war';
  const activeBuildBestScore = activeBuildBest?.score ?? 0;
  const activeBestClearLabel = activeRunBest?.clearCount
    ? formatRunTime(activeRunBest.bestClearSeconds)
    : null;
  const activeModeRankLabel = activeRunBest?.clearCount
    ? getModeFlowRankLabel(activeStage.category, activeRunBest.bestModeFlowRank ?? 0)
    : null;
  const hasBestRecord = isWarStage ? !!activeBestClearLabel : activeBuildBestScore > 0;
  const bestBigValue = isWarStage
    ? (activeBestClearLabel ?? '—')
    : (activeBuildBestScore > 0 ? `${activeBuildBestScore}` : '—');
  const bestUnit = isWarStage ? '' : (activeBuildBestScore > 0 ? 'pt' : '');
  const bestSubLabel = isWarStage
    ? (activeRunBest?.clearCount
        ? `クリア${activeRunBest.clearCount}回 / ${activeModeRankLabel}`
        : 'クリアでBESTタイム記録')
    : (activeBuildBestScore > 0 ? '作品スコア BEST' : 'つくってスコアを伸ばそう');
  const challengeRatio = activeChallengeCount > 0
    ? Math.round((activeCompletedCount / activeChallengeCount) * 100)
    : 0;
  const progressColumns = viewportSize.w < 360 ? '1fr' : 'repeat(3, minmax(0, 1fr))';
  const showSoloFallbackNotice = connectionState === 'offline' && !!connectionMessage;

  // 定期的にステージのプレイヤー数を取得
  useEffect(() => {
    if (phase !== 'menu') return;

    // Socket.IO サーバーと同じ URL を使用（Nginx ではなく Express API へ直接リクエスト）
    const serverUrl = import.meta.env.PROD
      ? 'https://halcraft-ws.rosch.jp'
      : `http://${window.location.hostname}:4001`;

    let mounted = true;
    const fetchStages = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/stages`);
        if (!res.ok) return;

        const data: unknown = await res.json();
        const counts = extractStagePlayerCounts(data);
        if (mounted && counts) {
          setStagePlayerCounts(counts);
        }
      } catch {
        // 無視
      }
    };

    fetchStages();
    const interval = setInterval(fetchStages, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [phase]);

  const isStartPending = isJoining && phase !== 'menu';

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent) => {
    // 入力フィールドのクリックでゲーム開始しないようにする
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!isValidName || isStartPending) return;

    setIsJoining(true);
    const trimmedName = name.trim();
    try { 
      localStorage.setItem(PLAYER_NAME_KEY, trimmedName); 
      localStorage.setItem(SELECTED_STAGE_KEY, activeStageId); 
      localStorage.setItem(SELECTED_CATEGORY_KEY, selectedCategory);
    } catch { /* noop */ }

    // ゲーム開始は、Fullscreen や通知などの補助処理に失敗しても必ず先に進める
    setStage(activeStageId);
    startGame();
    join(trimmedName, activeStageId);

    try {
      requestFullscreen();
    } catch {
      // noop
    }
    try {
      initAudio();
    } catch {
      // noop
    }
    initPushIfPWA().catch(() => { /* noop */ });

    // メニューのクリック直後に canvas をアクティブ化して操作不能に見える状態を防ぐ
    window.requestAnimationFrame(() => {
      activateDesktopGameplayInput();
      window.setTimeout(() => {
        activateDesktopGameplayInput();
      }, 120);
    });
  }, [isValidName, isStartPending, name, selectedCategory, activeStageId, setStage, startGame, join]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStart(e);
    }
  }, [handleStart]);

  if (phase !== 'menu') return null;

  return (
    <div
      id="start-screen"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        fontFamily: SG.font,
        padding: 0,
        /* モバイルでスクロール可能にする */
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* ハルが描いたタイトル画像（背景全面・スクロールに追従しない） */}
      <img
        src="/textures/title.jpg"
        alt="ハルクラ タイトル"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        draggable={false}
      />

      {/* 周辺減光ビネット（額縁感・中央に視線を集める） */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(120% 90% at 50% 38%, transparent 40%, rgba(0,0,0,0.34) 78%, rgba(0,0,0,0.6) 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* 上部グラデーション（タイトル＆設定ボタンの可読性） */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '34%',
          background: 'linear-gradient(to bottom, rgba(4,7,12,0.6) 0%, rgba(4,7,12,0.18) 55%, transparent 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* 下部グラデーション（UIを読みやすくする） */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '78%',
          background: 'linear-gradient(to top, rgba(4,7,12,0.96) 0%, rgba(4,7,12,0.7) 32%, rgba(4,7,12,0.32) 60%, transparent 100%)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* 左側グラデーション（アップデートログの可読性向上） */}
      {showUpdateLog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: '35%',
            background: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* アップデート履歴パネル（十分な画面サイズの場合のみ表示） */}
      {showUpdateLog && <UpdateLog />}

      {showDesktopLaunchDock && (
        <div
          id="start-launch-dock"
          className="sg-rise"
          style={{
            position: 'fixed',
            left: 'max(304px, calc((100vw - 860px) / 2))',
            bottom: 18,
            zIndex: 6,
            width: 'min(860px, calc(100vw - 328px))',
            minHeight: 94,
            padding: '12px 14px',
            borderRadius: 18,
            border: `1px solid ${activeStage.color}66`,
            background: 'linear-gradient(135deg, rgba(8,12,18,0.86), rgba(7,14,22,0.68))',
            boxShadow: `0 18px 42px rgba(0,0,0,0.52), 0 0 34px ${activeStage.color}2f, inset 0 1px 0 rgba(255,255,255,0.13)`,
            backdropFilter: 'blur(18px) saturate(1.16)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.16)',
            color: '#fff',
            fontFamily: SG.font,
            pointerEvents: 'auto',
            animationDelay: '0.18s',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              borderRadius: 18,
              pointerEvents: 'none',
            }}
          >
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: '-12%',
                top: '-85%',
                width: '58%',
                height: '210%',
                background: `linear-gradient(105deg, transparent, ${activeStage.color}2f, rgba(255,255,255,0.16), transparent)`,
                transform: 'rotate(10deg)',
                animation: 'sgShine 5.2s ease-in-out infinite',
              }}
            />
            <span
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.08), transparent 48%, rgba(0,0,0,0.22))',
              }}
            />
          </div>

          <div
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '140px minmax(0, 1fr) 164px 232px',
              alignItems: 'center',
              gap: 13,
              minWidth: 0,
            }}
          >
            <StageSceneryPreview stage={activeStage} compact={false} />

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  minWidth: 0,
                  color: activeStage.color,
                  fontSize: 11,
                  lineHeight: '14px',
                  fontWeight: 950,
                  letterSpacing: 1.2,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ flex: '0 0 auto', fontSize: 13 }}>{activeStage.icon}</span>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  出発準備 / {activeStage.name}
                </span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: '#fff',
                  fontSize: 14,
                  lineHeight: '18px',
                  fontWeight: 950,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeRecordGoal.title}
              </div>
              <div
                style={{
                  marginTop: 4,
                  color: 'rgba(255,255,255,0.64)',
                  fontSize: 10,
                  lineHeight: '13px',
                  fontWeight: 820,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {activePrepCues.slice(0, 2).map((cue) => `${cue.icon} ${cue.value}`).join(' / ')}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                id="player-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 8))}
                onKeyDown={handleKeyDown}
                placeholder="ハル"
                maxLength={8}
                autoComplete="off"
                autoFocus={!isTouch && showDesktopLaunchDock}
                style={{
                  width: '100%',
                  padding: '11px 30px 11px 15px',
                  fontSize: 19,
                  fontWeight: 850,
                  textAlign: 'center',
                  background: 'rgba(2,6,10,0.68)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '2px solid',
                  borderColor: isValidName ? 'rgba(111,230,168,0.9)' : 'rgba(255,255,255,0.18)',
                  borderRadius: 12,
                  color: '#fff',
                  outline: 'none',
                  letterSpacing: 3,
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                  boxShadow: isValidName ? `0 0 20px ${SG.emerald}55, var(--sg-inset-hi)` : 'var(--sg-shadow-sm)',
                  fontFamily: SG.font,
                  boxSizing: 'border-box',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.38)',
                  fontSize: 9,
                  fontWeight: 850,
                  fontFamily: SG.font,
                  pointerEvents: 'none',
                }}
              >
                {name.trim().length}/8
              </span>
            </div>

            <button
              id="start-game-button"
              type="button"
              onClick={handleStart}
              disabled={!isValidName || isStartPending}
              style={{
                appearance: 'none',
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                minHeight: 52,
                padding: '13px 20px',
                background: isValidName
                  ? 'linear-gradient(165deg, #67ee9d 0%, #31b86d 100%)'
                  : 'rgba(255,255,255,0.06)',
                border: '2px solid',
                borderColor: isValidName ? 'rgba(185,255,213,0.72)' : 'rgba(255,255,255,0.12)',
                borderRadius: 13,
                color: isValidName ? '#06210f' : 'rgba(255,255,255,0.34)',
                fontSize: 17,
                fontWeight: 950,
                letterSpacing: 1.2,
                fontFamily: SG.font,
                animation: isValidName ? 'pulse 2.4s ease-in-out infinite' : 'none',
                transition: 'all 0.25s var(--sg-ease)',
                pointerEvents: isValidName ? 'auto' : 'none',
                textShadow: isValidName ? '0 1px 0 rgba(255,255,255,0.26)' : 'none',
                boxShadow: isValidName
                  ? `0 12px 28px ${SG.emerald}5c, var(--sg-inset-hi)`
                  : 'none',
                cursor: isValidName ? 'pointer' : 'default',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ position: 'relative', zIndex: 1 }}>
                {isStartPending ? '接続中...' : '▶ クリックでスタート'}
              </span>
              {isValidName && !isStartPending && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '36%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.48), transparent)',
                    animation: 'sgShine 2.8s ease-in-out infinite',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* スペーサー：コンテンツが少ない場合に下寄せする */}
      <div style={{ flexGrow: 1, minHeight: isLandscapeMobile ? 20 : (showDesktopLaunchDock ? 34 : (isTouch ? 80 : 120)) }} />

      {/* UI コンテンツ */}
      <div
        id="start-screen-content"
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: showDesktopLaunchDock ? 160 : (isTouch ? 24 : 40),
          // アップデートログ表示時、中間幅ではコンテンツ列を右に寄せてログとの重なりを防ぐ
          paddingLeft: isTouch ? 12 : (showUpdateLog && viewportSize.w < 1280 ? 296 : 0),
          paddingRight: isTouch ? 12 : 0,
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ブランドロゴ（ハルクラ） */}
        <div
          className="sg-rise"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: compactLayout ? 16 : 26,
            animationDelay: '0s',
          }}
        >
          <div
            style={{
              fontFamily: SG.font,
              fontWeight: 900,
              fontSize: isLandscapeMobile ? 30 : (compactLayout ? 42 : 62),
              lineHeight: 1,
              letterSpacing: compactLayout ? 1 : 2,
              background: 'linear-gradient(150deg, #ffe27a 0%, #8ee86b 44%, #5ad1ff 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.6)) drop-shadow(0 0 24px rgba(120,230,150,0.34))',
              animation: 'sgFloat 5s ease-in-out infinite',
            }}
          >
            ハルクラ
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: compactLayout ? 9 : 14,
              marginTop: compactLayout ? 5 : 8,
            }}
          >
            <span style={{ width: compactLayout ? 24 : 46, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55))' }} />
            <span
              style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: compactLayout ? 10 : 13,
                fontWeight: 800,
                letterSpacing: compactLayout ? 4 : 8,
                textShadow: '0 1px 6px rgba(0,0,0,0.8)',
              }}
            >
              HALCRAFT
            </span>
            <span style={{ width: compactLayout ? 24 : 46, height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.55), transparent)' }} />
          </div>
          {!isLandscapeMobile && (
            <div
              style={{
                color: 'rgba(255,255,255,0.62)',
                fontSize: compactLayout ? 10 : 12.5,
                fontWeight: 600,
                letterSpacing: 1,
                textShadow: '0 1px 6px rgba(0,0,0,0.85)',
                marginTop: compactLayout ? 4 : 7,
              }}
            >
              ハルがつくった、ぼうけんの世界
            </div>
          )}
        </div>

        {/* STEP 1: あそびをえらぶ（建築 / 戦争 のモード選択） */}
        <div
          className="sg-rise"
          style={{
            marginBottom: compactLayout ? 14 : 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: compactLayout ? 8 : 10,
            animationDelay: '0.06s',
          }}
        >
          <StepLabel n={1} text="あそびをえらぶ" accent={selectedCategory === 'build' ? SG.build : SG.war} compact={compactLayout} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: compactLayout ? 9 : 12,
              justifyContent: 'center',
            }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const accent = cat.id === 'build' ? SG.build : SG.war;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setIsJoining(false);
                    setSelectedCategory(cat.id);
                  }}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    width: compactLayout ? 'min(46vw, 168px)' : 222,
                    padding: compactLayout ? '12px 12px' : '16px 18px',
                    background: isSelected
                      ? `linear-gradient(165deg, ${accent}38 0%, ${accent}12 100%)`
                      : 'rgba(8,12,18,0.5)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '2px solid',
                    borderColor: isSelected ? accent : 'rgba(255,255,255,0.16)',
                    borderRadius: 16,
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.22,1,0.36,1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: compactLayout ? 3 : 5,
                    boxShadow: isSelected
                      ? `0 10px 28px ${accent}44, inset 0 1px 0 rgba(255,255,255,0.14)`
                      : '0 4px 14px rgba(0,0,0,0.32)',
                    transform: isSelected ? 'translateY(-3px)' : 'none',
                    fontFamily: SG.font,
                    textAlign: 'center',
                  }}
                >
                  {isSelected && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 7,
                        right: 9,
                        fontSize: compactLayout ? 9 : 10,
                        fontWeight: 900,
                        color: accent,
                        letterSpacing: 0.5,
                      }}
                    >
                      ✓ えらび中
                    </span>
                  )}
                  <span style={{ fontSize: compactLayout ? 26 : 34, lineHeight: 1, filter: isSelected ? `drop-shadow(0 0 10px ${accent}aa)` : 'none' }}>{cat.icon}</span>
                  <span style={{ fontSize: compactLayout ? 16 : 20, fontWeight: 900, letterSpacing: 1 }}>{cat.name}</span>
                  <span style={{ fontSize: compactLayout ? 10 : 11.5, opacity: 0.84, fontWeight: 600 }}>{cat.caption}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 2: マップをえらぶ（見出し＋カテゴリ進捗チップ） */}
        <div
          className="sg-rise"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginBottom: isTouch ? 9 : 11,
            animationDelay: '0.12s',
          }}
        >
          <StepLabel n={2} text="マップをえらぶ" accent={selectedCategory === 'build' ? SG.build : SG.war} compact={compactLayout} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: isTouch ? 6 : 8,
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: `${selectedCategory === 'build' ? '建築' : '戦争'}熟練`, value: `${categoryAverageMastery}/100`, accent: selectedCategory === 'build' ? SG.build : SG.war },
              { label: 'MASTER', value: `${categoryMasteredCount}/${filteredStages.length}`, accent: SG.gold },
              { label: '選択中', value: activeMastery.rankLabel, accent: SG.emerald },
            ].map((chip) => (
              <span
                key={chip.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: isTouch ? '3px 9px' : '4px 11px',
                  borderRadius: 999,
                  background: 'rgba(8,12,18,0.5)',
                  border: `1px solid ${chip.accent}55`,
                  fontSize: isTouch ? 9 : 10.5,
                  fontWeight: 800,
                  fontFamily: SG.font,
                  color: 'rgba(255,255,255,0.62)',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.label}
                <span style={{ color: chip.accent, fontWeight: 900 }}>{chip.value}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ステージ選択UI（選択カテゴリに属するステージのみ表示） */}
        <div
          id="start-screen-stages"
          className="sg-rise"
          style={{
            marginBottom: isTouch ? 14 : 18,
            display: 'flex',
            flexDirection: 'row',
            gap: isTouch ? 8 : 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: isTouch ? 340 : 840,
            animationDelay: '0.16s',
          }}
        >
          {filteredStages.map((stage) => {
            const isSelected = activeStageId === stage.id;
            const players = stagePlayerCounts[stage.id] || 0;
            const challengeCount = getStageChallenges(stage.id).length;
            const best = bestByStage[stage.id];
            const completedCount = best?.completedCount ?? 0;
            const medal = getStageChallengeMedal(completedCount, challengeCount);
            const medalLabel = getStageChallengeMedalLabel(medal);
            const condition = getStageCondition(stage.id);
            const buildBestScore = buildBestByStage[stage.id]?.score ?? 0;
            const runBonus = getStageRunBonusForProgress(stage.id, medal, buildBestScore);
            const signatureAward = getStageSignatureAward({
              stage,
              runBest: best,
              buildBest: buildBestByStage[stage.id],
            });
            const signaturePerk = getStageSignaturePerkForAward(stage, signatureAward);
            const recordGoal = getStageRecordGoal({
              stage,
              runBest: best,
              buildBest: buildBestByStage[stage.id],
            });
            const mastery = stageMasteries[stage.id]
              ?? getStageMasterySummary({
                stage,
                completedCount,
                challengeCount,
                buildScore: buildBestByStage[stage.id]?.score ?? 0,
              });
            return (
              <div
                key={stage.id}
                onClick={() => {
                  setIsJoining(false);
                  setSelectedStageId(stage.id);
                }}
                style={{
                  width: isTouch ? 154 : 188,
                  minHeight: isTouch ? 132 : 150,
                  padding: isTouch ? '8px 9px' : '10px 12px',
                  background: isSelected
                    ? `linear-gradient(180deg, ${stage.color}66 0%, rgba(8,12,18,0.9) 100%)`
                    : 'linear-gradient(180deg, rgba(22,29,40,0.86) 0%, rgba(5,8,13,0.82) 100%)',
                  backdropFilter: 'blur(14px) saturate(1.14)',
                  WebkitBackdropFilter: 'blur(14px) saturate(1.14)',
                  border: '2px solid',
                  borderColor: isSelected ? `${stage.color}ee` : 'rgba(255,255,255,0.24)',
                  borderRadius: 8,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.86)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: isSelected
                    ? `0 12px 28px rgba(0,0,0,0.45), 0 0 22px ${stage.color}77, inset 0 1px 0 rgba(255,255,255,0.18)`
                    : '0 10px 24px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.1)',
                  textAlign: 'center',
                }}
              >
                <StageSceneryPreview stage={stage} compact={isTouch} />
                <div style={{ fontSize: isTouch ? 20 : 24 }}>{stage.icon}</div>
                <div style={{ fontSize: isTouch ? 12 : 14, fontWeight: 900, lineHeight: '16px' }}>{stage.name}</div>
                <div style={{
                  minHeight: isTouch ? 26 : 30,
                  fontSize: isTouch ? 9 : 10,
                  lineHeight: isTouch ? '13px' : '15px',
                  color: 'rgba(255,255,255,0.8)',
                }}>
                  {stage.rules.shortPitch}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: 3,
                }}>
                  {stage.rules.featureTags.slice(0, isTouch ? 2 : 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.14)',
                        color: 'rgba(255,255,255,0.86)',
                        fontSize: isTouch ? 8 : 9,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div style={{
                  fontSize: isTouch ? 9 : 11,
                  marginTop: 'auto',
                  color: players > 0 ? '#77f29a' : 'rgba(255,255,255,0.54)',
                }}>
                  {players > 0 ? `🟢 ${players}人` : '○ 0人'}
                </div>
                {condition && (
                  <div
                    style={{
                      width: '100%',
                      color: condition.accent,
                      fontSize: isTouch ? 8 : 9,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {condition.icon} {condition.triggerLabel}→{condition.effect.label}
                  </div>
                )}
                <div
                  style={{
                    width: '100%',
                    color: recordGoal.accent,
                    fontSize: isTouch ? 8 : 9,
                    fontWeight: 950,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {recordGoal.icon} {recordGoal.trophyLabel}: {recordGoal.progressLabel}
                </div>
                {best?.clearCount && (
                  <div
                    style={{
                      width: '100%',
                      color: 'rgba(168,255,205,0.92)',
                      fontSize: isTouch ? 8 : 9,
                      fontWeight: 950,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace',
                    }}
                  >
                    BEST {formatRunTime(best.bestClearSeconds)} / {best.clearCount}回
                  </div>
                )}
                {runBonus && (
                  <div
                    style={{
                      width: '100%',
                      color: runBonus.accent,
                      fontSize: isTouch ? 8 : 9,
                      fontWeight: 900,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {runBonus.icon} {runBonus.shortLabel}: {formatStageRunBonusLabel(runBonus)}
                  </div>
                )}
                {signaturePerk && (
                  <div
                    style={{
                      width: '100%',
                      color: signaturePerk.accent,
                      fontSize: isTouch ? 8 : 9,
                      fontWeight: 950,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {signaturePerk.icon} 称号特典: {formatStageSignaturePerkLabel(signaturePerk)}
                  </div>
                )}
                <div
                  style={{
                    width: '100%',
                    marginTop: 1,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 5,
                      color: mastery.accent,
                      fontSize: isTouch ? 8 : 9,
                      fontWeight: 950,
                      fontFamily: 'monospace',
                    }}
                  >
                    <span>熟練</span>
                    <span>{mastery.rankLabel} {mastery.score}%</span>
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      height: 4,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: `${mastery.score}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${mastery.accent}, ${stage.color})`,
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 5,
                    color: medal === 'gold' ? '#ffe680' : 'rgba(255,255,255,0.58)',
                    fontSize: isTouch ? 8 : 9,
                    fontWeight: 900,
                    fontFamily: 'monospace',
                  }}
                >
                  <span>{completedCount}/{challengeCount}</span>
                  <span>{medalLabel}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* STEP 3: さくせんを確認 */}
        <div
          className="sg-rise"
          style={{ marginBottom: isTouch ? 8 : 10, animationDelay: '0.2s' }}
        >
          <StepLabel n={3} text="さくせんを確認" accent={activeStage.color} compact={compactLayout} />
        </div>

        {/* 選択中ステージの差分ブリーフィング */}
        <div
          id="stage-briefing-panel"
          className="sg-rise"
          style={{
            width: briefingPanelWidth,
            marginBottom: isTouch ? 14 : 18,
            padding: isTouch ? '11px 12px' : '16px 18px',
            background: 'rgba(8,12,18,0.66)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 18,
            color: '#fff',
            boxShadow: `var(--sg-shadow), 0 0 26px ${activeStage.color}26`,
            display: 'flex',
            flexDirection: 'column',
            gap: isTouch ? 11 : 13,
            animationDelay: '0.24s',
          }}
        >
          <StageSceneryPreview stage={activeStage} compact={compactLayout} large />

          {/* ── ヒーローヘッダー（マップ名 + 目的） ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isTouch ? 9 : 12,
              minWidth: 0,
              paddingBottom: isTouch ? 9 : 11,
              borderBottom: `1px solid ${activeStage.color}33`,
            }}
          >
            <span
              style={{
                fontSize: isTouch ? 26 : 34,
                flexShrink: 0,
                lineHeight: 1,
                filter: `drop-shadow(0 0 10px ${activeStage.color}99)`,
              }}
            >
              {activeStage.icon}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: activeStage.color,
                  fontSize: isTouch ? 14 : 17,
                  fontWeight: 900,
                  lineHeight: '20px',
                  letterSpacing: 0.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeStage.name}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: isTouch ? 10 : 12,
                  lineHeight: isTouch ? '14px' : '16px',
                  marginTop: 2,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {activeStage.rules.objective.description}
              </div>
            </div>
          </div>

          {/* ── あなたの記録（進捗バンド・エメラルド） ── */}
          <div
            style={{
              padding: compactLayout ? '9px 10px' : '11px 13px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(46,170,118,0.26) 0%, rgba(24,70,56,0.16) 100%)',
              border: '1px solid rgba(120,235,182,0.34)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: compactLayout ? 7 : 9,
              }}
            >
              <span style={{ fontSize: compactLayout ? 12 : 13 }}>🏆</span>
              <span
                style={{
                  fontSize: compactLayout ? 10 : 11,
                  fontWeight: 900,
                  letterSpacing: 1.5,
                  color: 'rgba(190,255,222,0.95)',
                }}
              >
                あなたの記録
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: progressColumns,
                gap: compactLayout ? 7 : 9,
              }}
            >
              {/* 熟練度 */}
              <div
                style={{
                  minWidth: 0,
                  padding: compactLayout ? '8px 9px' : '9px 11px',
                  borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${activeMastery.mastered ? 'rgba(166,255,207,0.55)' : 'rgba(255,255,255,0.12)'}`,
                }}
              >
                <div style={{ fontSize: compactLayout ? 8 : 9, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                  マップ熟練
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: compactLayout ? 20 : 26, fontWeight: 900, lineHeight: 1, color: activeMastery.accent, fontFamily: 'monospace' }}>
                    {activeMastery.score}
                  </span>
                  <span style={{ fontSize: compactLayout ? 9 : 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>/100</span>
                  <span style={{ marginLeft: 'auto', fontSize: compactLayout ? 9 : 10, fontWeight: 900, color: activeMastery.accent, flexShrink: 0 }}>
                    {activeMastery.rankLabel}
                  </span>
                </div>
                <div style={{ marginTop: 6, height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.12)' }}>
                  <div
                    style={{
                      width: `${activeMastery.score}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${activeMastery.accent}, ${activeStage.color})`,
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: compactLayout ? 8 : 9,
                    color: 'rgba(255,255,255,0.55)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {activeMastery.mastered ? `👑 ${activeMastery.title}` : activeMastery.nextLabel}
                </div>
              </div>

              {/* チャレンジ + メダル */}
              <div
                style={{
                  minWidth: 0,
                  padding: compactLayout ? '8px 9px' : '9px 11px',
                  borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${activeMedal === 'gold' ? 'rgba(255,230,128,0.55)' : 'rgba(255,255,255,0.12)'}`,
                }}
              >
                <div style={{ fontSize: compactLayout ? 8 : 9, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                  チャレンジ
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: compactLayout ? 20 : 26, fontWeight: 900, lineHeight: 1, fontFamily: 'monospace', color: '#fff' }}>
                    {activeCompletedCount}
                  </span>
                  <span style={{ fontSize: compactLayout ? 10 : 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                    /{activeChallengeCount}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: compactLayout ? 9 : 10,
                      fontWeight: 900,
                      color: activeMedal === 'gold' ? '#ffe680' : 'rgba(255,255,255,0.72)',
                      flexShrink: 0,
                    }}
                  >
                    {activeMedalLabel}
                  </span>
                </div>
                <div style={{ marginTop: 6, height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.12)' }}>
                  <div
                    style={{
                      width: `${challengeRatio}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: activeMedal === 'gold'
                        ? 'linear-gradient(90deg, #ffe680, #ffb74d)'
                        : 'linear-gradient(90deg, #7fe3ff, #5aa9ff)',
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: compactLayout ? 8 : 9,
                    color: 'rgba(255,255,255,0.55)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {activeCompletedCount >= activeChallengeCount && activeChallengeCount > 0
                    ? '🎖 全クリア達成'
                    : `あと${Math.max(0, activeChallengeCount - activeCompletedCount)}個で金メダル`}
                </div>
              </div>

              {/* ベスト記録 */}
              <div
                style={{
                  minWidth: 0,
                  padding: compactLayout ? '8px 9px' : '9px 11px',
                  borderRadius: 9,
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${hasBestRecord ? 'rgba(168,255,205,0.5)' : 'rgba(255,255,255,0.12)'}`,
                }}
              >
                <div style={{ fontSize: compactLayout ? 8 : 9, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
                  {isWarStage ? (compactLayout ? 'ベスト' : 'ベストタイム') : (compactLayout ? 'スコア' : '作品スコア')}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 2, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      fontSize: compactLayout ? 20 : 26,
                      fontWeight: 900,
                      lineHeight: 1,
                      fontFamily: 'monospace',
                      color: hasBestRecord ? 'rgba(168,255,205,0.95)' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {bestBigValue}
                  </span>
                  {bestUnit && (
                    <span style={{ fontSize: compactLayout ? 10 : 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>{bestUnit}</span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: compactLayout ? 10 : 12,
                    fontSize: compactLayout ? 8 : 9,
                    color: 'rgba(255,255,255,0.55)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {bestSubLabel}
                </div>
              </div>
            </div>
            <div
              id="stage-record-goal"
              style={{
                marginTop: compactLayout ? 8 : 10,
                padding: compactLayout ? '8px 9px' : '9px 11px',
                borderRadius: 10,
                background: activeRecordGoal.completed
                  ? 'linear-gradient(135deg, rgba(166,255,207,0.18), rgba(255,230,128,0.10))'
                  : 'rgba(0,0,0,0.28)',
                border: `1px solid ${activeRecordGoal.accent}55`,
                boxShadow: activeRecordGoal.completed
                  ? `0 0 18px ${activeRecordGoal.accent}24, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: compactLayout ? 7 : 9,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: compactLayout ? 14 : 16,
                    filter: `drop-shadow(0 0 8px ${activeRecordGoal.accent}66)`,
                  }}
                >
                  {activeRecordGoal.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: activeRecordGoal.accent,
                      fontSize: compactLayout ? 9 : 10,
                      lineHeight: '13px',
                      fontWeight: 950,
                      letterSpacing: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    次の記録 / {activeRecordGoal.trophyLabel}
                  </div>
                  <div
                    style={{
                      color: '#fff',
                      fontSize: compactLayout ? 11 : 12,
                      lineHeight: '15px',
                      fontWeight: 950,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {activeRecordGoal.title}
                  </div>
                </div>
                <div
                  style={{
                    flex: '0 0 auto',
                    color: activeRecordGoal.accent,
                    fontSize: compactLayout ? 10 : 11,
                    fontWeight: 950,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeRecordGoal.progressLabel}
                </div>
              </div>
              <div
                style={{
                  marginTop: 6,
                  height: 5,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(activeRecordGoal.ratio * 100)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${activeRecordGoal.accent}, ${activeStage.color})`,
                  }}
                />
              </div>
              <div
                style={{
                  marginTop: 5,
                  color: 'rgba(255,255,255,0.62)',
                  fontSize: compactLayout ? 8 : 9,
                  lineHeight: compactLayout ? '12px' : '13px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeRecordGoal.detail}
              </div>
            </div>

            <div
              id="stage-prep-plan"
              style={{
                marginTop: compactLayout ? 8 : 10,
                padding: compactLayout ? '8px 9px' : '9px 11px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.075), rgba(0,0,0,0.24))',
                border: `1px solid ${activeStage.color}55`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 16px ${activeStage.color}16`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  marginBottom: compactLayout ? 6 : 7,
                }}
              >
                <span style={{ fontSize: compactLayout ? 12 : 13 }}>🧭</span>
                <span
                  style={{
                    color: activeStage.color,
                    fontSize: compactLayout ? 9 : 10,
                    lineHeight: '12px',
                    fontWeight: 950,
                    letterSpacing: 1.2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  出発前プラン
                </span>
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: `linear-gradient(90deg, ${activeStage.color}66, transparent)`,
                  }}
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: viewportSize.w < 390
                    ? '1fr'
                    : viewportSize.w < 720
                      ? 'repeat(2, minmax(0, 1fr))'
                      : 'repeat(4, minmax(0, 1fr))',
                  gap: compactLayout ? 6 : 8,
                }}
              >
                {activePrepCues.map((cue) => (
                  <div
                    key={`${cue.label}-${cue.value}`}
                    style={{
                      minWidth: 0,
                      padding: compactLayout ? '7px 8px' : '8px 9px',
                      borderRadius: 8,
                      background: `${cue.accent}13`,
                      border: `1px solid ${cue.accent}42`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        minWidth: 0,
                      }}
                    >
                      <span style={{ flex: '0 0 auto', fontSize: compactLayout ? 11 : 12 }}>{cue.icon}</span>
                      <span
                        style={{
                          minWidth: 0,
                          color: cue.accent,
                          fontSize: compactLayout ? 8 : 9,
                          lineHeight: '11px',
                          fontWeight: 950,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cue.label}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        color: '#fff',
                        fontSize: compactLayout ? 10 : 11,
                        lineHeight: compactLayout ? '13px' : '14px',
                        fontWeight: 950,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {cue.value}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        color: 'rgba(255,255,255,0.58)',
                        fontSize: compactLayout ? 8 : 9,
                        lineHeight: compactLayout ? '11px' : '12px',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {cue.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── マップ情報（ルール / 戦い方 / もちもの でゾーン分け） ── */}
          {BRIEFING_GROUPS.map((group) => {
            const items = activeBriefingSections.filter((s) => s.group === group.id);
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    marginBottom: isTouch ? 6 : 7,
                  }}
                >
                  <span style={{ fontSize: isTouch ? 11 : 12 }}>{group.icon}</span>
                  <span
                    style={{
                      fontSize: isTouch ? 10 : 11,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      color: group.tint,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 1,
                      background: `linear-gradient(90deg, ${group.tint}55, transparent)`,
                    }}
                  />
                </div>
                <div
                  className="stage-briefing-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: briefingColumns,
                    gap: isTouch ? 6 : 8,
                  }}
                >
                  {items.map((section) => (
                    <div
                      key={section.title}
                      style={{
                        minWidth: 0,
                        padding: isTouch ? '7px 8px' : '8px 10px',
                        borderLeft: `3px solid ${section.accent}`,
                        background: 'rgba(255,255,255,0.055)',
                        borderRadius: '4px 8px 8px 4px',
                      }}
                    >
                      <div
                        style={{
                          color: 'rgba(255,255,255,0.45)',
                          fontSize: isTouch ? 8 : 9,
                          fontWeight: 900,
                          letterSpacing: 1,
                          marginBottom: 3,
                        }}
                      >
                        {section.title}
                      </div>
                      <div
                        style={{
                          color: '#fff',
                          fontSize: isTouch ? 9 : 11,
                          fontWeight: 900,
                          lineHeight: isTouch ? '13px' : '15px',
                          minHeight: isTouch ? 25 : 30,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {section.value}
                      </div>
                      {section.details.map((detail) => (
                        <div
                          key={detail}
                          style={{
                            color: 'rgba(255,255,255,0.62)',
                            fontSize: isTouch ? 8 : 9,
                            lineHeight: isTouch ? '12px' : '14px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* STEP 4: なまえを入れてスタート */}
        {!showDesktopLaunchDock && (
        <div
          className="sg-rise"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isTouch ? 9 : 12,
            animationDelay: '0.3s',
          }}
        >
          <StepLabel n={4} text="なまえを入れてスタート" accent={SG.emerald} compact={compactLayout} />
          <div
            style={{
              display: 'flex',
              flexDirection: compactLayout ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compactLayout ? 8 : 12,
            }}
          >
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <input
                id="player-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 8))}
                onKeyDown={handleKeyDown}
                placeholder="ハル"
                maxLength={8}
                autoComplete="off"
                autoFocus={!isTouch && !showUpdateLog}
                style={{
                  width: isTouch ? 190 : 248,
                  padding: isTouch ? '11px 16px' : '13px 18px',
                  fontSize: isTouch ? 17 : 22,
                  fontWeight: 800,
                  textAlign: 'center',
                  background: 'rgba(6,10,16,0.62)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '2px solid',
                  borderColor: isValidName ? 'rgba(111,230,168,0.85)' : 'rgba(255,255,255,0.2)',
                  borderRadius: 14,
                  color: '#fff',
                  outline: 'none',
                  letterSpacing: 4,
                  transition: 'border-color 0.3s, box-shadow 0.3s',
                  boxShadow: isValidName ? `0 0 22px ${SG.emerald}4d, var(--sg-inset-hi)` : 'var(--sg-shadow-sm)',
                  fontFamily: SG.font,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'rgba(255,255,255,0.34)',
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: SG.font,
                  pointerEvents: 'none',
                }}
              >
                {name.trim().length}/8
              </span>
            </div>

            <button
              id="start-game-button"
              type="button"
              onClick={handleStart}
              disabled={!isValidName || isStartPending}
              style={{
                appearance: 'none',
                position: 'relative',
                overflow: 'hidden',
                minWidth: isTouch ? 200 : 240,
                padding: isTouch ? '12px 26px' : '15px 32px',
                background: isValidName
                  ? 'linear-gradient(165deg, #58d98a 0%, #2fa863 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: '2px solid',
                borderColor: isValidName ? 'rgba(150,255,195,0.65)' : 'rgba(255,255,255,0.1)',
                borderRadius: 14,
                color: isValidName ? '#06210f' : 'rgba(255,255,255,0.3)',
                fontSize: isTouch ? 16 : 19,
                fontWeight: 900,
                letterSpacing: 1.5,
                fontFamily: SG.font,
                animation: isValidName ? 'pulse 2.4s ease-in-out infinite' : 'none',
                transition: 'all 0.25s var(--sg-ease)',
                pointerEvents: isValidName ? 'auto' : 'none',
                textShadow: isValidName ? '0 1px 0 rgba(255,255,255,0.25)' : 'none',
                boxShadow: isValidName
                  ? `0 10px 28px ${SG.emerald}55, var(--sg-inset-hi)`
                  : 'none',
                cursor: isValidName ? 'pointer' : 'default',
                textAlign: 'center',
                boxSizing: 'border-box',
                backdropFilter: isValidName ? 'none' : 'blur(4px)',
              }}
            >
              <span style={{ position: 'relative', zIndex: 1 }}>
                {isStartPending ? '接続中...' : `▶ ${isTouch ? 'タップでスタート' : 'クリックでスタート'}`}
              </span>
              {isValidName && !isStartPending && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '36%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                    animation: 'sgShine 2.8s ease-in-out infinite',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </button>
          </div>
        </div>
        )}

        {/* スキン選択 */}
        <div style={{ marginTop: isTouch ? 8 : 12 }}>
          <SkinSelector compact />
        </div>

        {/* マルチ不通時も、ひとりプレイで続けられることを表示 */}
        {showSoloFallbackNotice && (
          <div
            style={{
              marginTop: 10,
              padding: isTouch ? '6px 12px' : '7px 16px',
              background: 'rgba(255, 213, 106, 0.18)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255, 213, 106, 0.42)',
              borderRadius: 8,
              color: '#ffe08a',
              fontSize: isTouch ? 11 : 13,
              fontWeight: 850,
              lineHeight: 1.35,
              textShadow: '0 1px 3px rgba(0,0,0,0.72)',
              textAlign: 'center',
              maxWidth: isTouch ? 'calc(100vw - 32px)' : 440,
            }}
          >
            ⚡ {connectionMessage}
          </div>
        )}

        {/* サーバー満員表示 */}
        {serverFull && (
          <div
            style={{
              marginTop: 10,
              padding: '6px 16px',
              background: 'rgba(231, 76, 60, 0.3)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(231, 76, 60, 0.5)',
              borderRadius: 6,
              color: '#ff6b6b',
              fontSize: isTouch ? 12 : 14,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            サーバーが満員です（最大10人）
          </div>
        )}

        {/* 操作説明（キーキャップ風チップ） */}
        <div
          style={{
            marginTop: compactLayout ? 14 : 22,
            display: 'flex',
            flexWrap: 'wrap',
            gap: isTouch ? 6 : 8,
            justifyContent: 'center',
            alignItems: 'center',
            maxWidth: isTouch ? 'calc(100vw - 28px)' : 720,
          }}
        >
          {(isTouch
            ? [
                { key: 'L', label: '移動' },
                { key: 'R', label: '視点' },
                { key: 'タップ', label: '破壊/設置' },
                { key: '▲', label: 'ジャンプ/飛行' },
              ]
            : [
                { key: 'WASD', label: '移動' },
                { key: 'Space', label: 'ジャンプ' },
                { key: 'Space×2', label: '飛行' },
                { key: 'L-Click', label: '破壊' },
                { key: 'R-Click', label: '設置' },
                { key: '1-9', label: 'ブロック/武器' },
                { key: 'F', label: '✈ 飛行機' },
              ]
          ).map((c) => (
            <span
              key={c.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: isTouch ? '4px 8px 4px 5px' : '5px 11px 5px 6px',
                borderRadius: 999,
                background: 'rgba(8,12,18,0.42)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: SG.font,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: isTouch ? 18 : 22,
                  height: isTouch ? 18 : 22,
                  padding: '0 6px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.13)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  color: '#fff',
                  fontSize: isTouch ? 9 : 10.5,
                  fontWeight: 800,
                  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.3)',
                }}
              >
                {c.key}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.62)', fontSize: isTouch ? 9.5 : 11, fontWeight: 600 }}>{c.label}</span>
            </span>
          ))}
        </div>

        {/* iOS Safari用：ホーム画面に追加の案内バナー */}
        <div style={{ marginTop: isTouch ? 12 : 16, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <InstallBanner />
        </div>

        {/* 下端の余白（Safe Area対応） */}
        <div style={{ height: 'env(safe-area-inset-bottom, 16px)', minHeight: 16 }} />
      </div>
    </div>
  );
}
