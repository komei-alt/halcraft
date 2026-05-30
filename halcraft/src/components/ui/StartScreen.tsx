// スタート画面コンポーネント
// ハルが描いたタイトル画像を背景に使用
// 名前入力 + カテゴリ→ステージ2段選択 + クリック/タップでゲーム開始
// デバイスに応じて操作説明を切り替え
// スマホ縦・横両対応（スクロール可能）

import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { getStageChallenges, getStageChallengeMedal, getStageChallengeMedalLabel } from '../../types/stageChallenges';
import { getStageCondition } from '../../types/stageConditions';
import { getStagePressure } from '../../types/stagePressures';
import { getStageEvent } from '../../types/stageEvents';
import { formatStageBossReward, getStageBossEncounter } from '../../types/stageBossEncounters';
import { formatStageBuildFocus, getStageBuildStyle } from '../../types/stageBuildStyles';
import {
  getStageMasterySummary,
  type StageMasterySummary,
} from '../../types/stageMastery';
import {
  formatStageRunBonusLabel,
  getStageOpeningItemLabel,
  getStageRunBonus,
  type StageRunBonus,
} from '../../types/stageRunBonuses';
import { formatStageHotbarPreview, getStageStarterHotbarItemCounts } from '../../types/stageHotbars';
import { formatStageCombatBonus, getStageCombatStyle } from '../../types/stageCombatStyles';
import { formatStageEnemyProfile, getStageEnemyProfile } from '../../types/stageEnemyProfiles';
import { formatStageModeReward, getStageModeRule } from '../../types/stageModeRules';
import { getModeFlowRankLabel } from '../../stores/useModeFlowStore';
import { useStageChallengeStore, type StageChallengeBest } from '../../stores/useStageChallengeStore';
import { useStageBuildScoreStore } from '../../stores/useStageBuildScoreStore';
import { BLOCK_DEFS, type BlockId } from '../../types/blocks';
import { TOOL_DEFS, type ToolId } from '../../types/tools';

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

interface StageBriefingSection {
  title: string;
  value: string;
  details: string[];
  accent: string;
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

function getStageRunRecordDetails(
  stage: StageDefinition,
  best: StageChallengeBest | undefined,
  compact: boolean,
): string[] {
  if (!best?.clearCount) return ['クリアするとBESTが残る'];

  const rankLabel = getModeFlowRankLabel(stage.category, best.bestModeFlowRank ?? 0);
  const activationLabel = `発動最多 ${best.bestModeActivations ?? 0}回`;
  const streakLabel = stage.category === 'war'
    ? `連続 x${best.bestStreak ?? 0}`
    : 'テーマ行動で更新';

  return compact
    ? [rankLabel, activationLabel]
    : [rankLabel, activationLabel, streakLabel];
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
  challenges: ReturnType<typeof getStageChallenges>,
  completedCount: number,
  challengeCount: number,
  mastery: StageMasterySummary,
  best: StageChallengeBest | undefined,
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
    getStageStarterHotbarItemCounts(stage, runBonus),
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
    });
  }

  const enemyProfile = getStageEnemyProfile(stage.id);
  if (enemyProfile) {
    sections.push({
      title: '敵編成',
      value: `${enemyProfile.icon} ${enemyProfile.title}`,
      details: [
        formatStageEnemyProfile(enemyProfile),
        enemyProfile.detail,
      ],
      accent: enemyProfile.accent,
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
    });
  }

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
    },
  );

  if (runBonus) {
    sections.push({
      title: 'メダル特典',
      value: `${runBonus.icon} ${runBonus.title}`,
      details: [
        runBonus.shortLabel,
        formatStageRunBonusLabel(runBonus),
      ],
      accent: runBonus.accent,
    });
  }

  sections.push({
    title: 'マップ熟練',
    value: `${mastery.rankLabel} ${mastery.score}/100`,
    details: [
      mastery.title,
      mastery.nextLabel,
    ],
    accent: mastery.accent,
  });

  if (best?.clearCount) {
    sections.push({
      title: 'ベスト記録',
      value: `BEST ${formatRunTime(best.bestClearSeconds)} / ${best.clearCount}回`,
      details: getStageRunRecordDetails(stage, best, compact),
      accent: 'rgba(168, 255, 205, 0.95)',
    });
  }

  sections.push(
    {
      title: stage.rules.enemyTuning ? '敵とやり込み' : 'やり込み',
      value: `${completedCount}/${challengeCount} チャレンジ`,
      details: stage.rules.enemyTuning
        ? [
            ...getEnemyPreview(stage).slice(0, compact ? 1 : 2),
            ...challengePreview.slice(0, 1),
          ]
        : challengePreview,
      accent: stage.rules.enemyTuning ? 'rgba(255, 154, 102, 0.95)' : 'rgba(150, 230, 255, 0.95)',
    },
  );

  return sections;
}

export function StartScreen() {
  const phase = useGameStore((s) => s.phase);
  const startGame = useGameStore((s) => s.startGame);
  const setStage = useGameStore((s) => s.setStage);
  const join = useMultiplayerStore((s) => s.join);
  const serverFull = useMultiplayerStore((s) => s.serverFull);
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
    () => getStageRunBonus(activeStage.id, activeMedal),
    [activeStage.id, activeMedal],
  );
  const activeBriefingSections = useMemo(
    () => getStageBriefingSections(
      activeStage,
      activeCondition,
      activePressure,
      activeEvent,
      activeRunBonus,
      activeChallenges,
      activeCompletedCount,
      activeChallengeCount,
      activeMastery,
      activeRunBest,
      compactLayout,
    ),
    [
      activeStage,
      activeCondition,
      activePressure,
      activeEvent,
      activeRunBonus,
      activeChallenges,
      activeCompletedCount,
      activeChallengeCount,
      activeMastery,
      activeRunBest,
      compactLayout,
    ],
  );

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

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent) => {
    // 入力フィールドのクリックでゲーム開始しないようにする
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (!isValidName || isJoining) return;

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
  }, [isValidName, isJoining, name, selectedCategory, activeStageId, setStage, startGame, join]);

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
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
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

      {/* 下部グラデーション（UIを読みやすくする） */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 40%, transparent 100%)',
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

      {/* スペーサー：コンテンツが少ない場合に下寄せする */}
      <div style={{ flexGrow: 1, minHeight: isLandscapeMobile ? 20 : (isTouch ? 80 : 120) }} />

      {/* UI コンテンツ */}
      <div
        id="start-screen-content"
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingBottom: isTouch ? 24 : 40,
          paddingLeft: isTouch ? 12 : 0,
          paddingRight: isTouch ? 12 : 0,
          gap: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* カテゴリ選択（建築 / 戦争） */}
        <div
          style={{
            marginBottom: isTouch ? 10 : 14,
            display: 'flex',
            flexDirection: 'row',
            gap: isTouch ? 8 : 10,
            justifyContent: 'center',
          }}
        >
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  width: isTouch ? 150 : 200,
                  padding: isTouch ? '7px 10px' : '10px 14px',
                  background: isSelected ? cat.color : 'rgba(0,0,0,0.48)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid',
                  borderColor: isSelected
                    ? (cat.id === 'build' ? 'rgba(130, 210, 255, 0.82)' : 'rgba(220, 100, 80, 0.82)')
                    : 'rgba(255,255,255,0.18)',
                  borderRadius: 8,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.68)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: isSelected ? `0 0 16px ${cat.glowColor}` : 'none',
                  fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: isTouch ? 16 : 20 }}>{cat.icon}</span>
                <span style={{ fontSize: isTouch ? 13 : 15, fontWeight: 800 }}>{cat.name}</span>
                <span style={{ fontSize: isTouch ? 10 : 11, opacity: 0.82 }}>{cat.caption}</span>
              </button>
            );
          })}
        </div>

        {/* ステージ選択UI（選択カテゴリに属するステージのみ表示） */}
        <div
          id="start-screen-stages"
          style={{
            marginBottom: isTouch ? 12 : 16,
            display: 'flex',
            flexDirection: 'row',
            gap: isTouch ? 8 : 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: isTouch ? 340 : 820,
          }}
        >
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              flexWrap: 'wrap',
              color: 'rgba(255,255,255,0.72)',
              fontSize: isTouch ? 9 : 10,
              fontWeight: 900,
              marginBottom: 2,
            }}
          >
            <span style={{ color: selectedCategory === 'build' ? '#9bdcff' : '#ffb36d' }}>
              {selectedCategory === 'build' ? '建築' : '戦争'}熟練 {categoryAverageMastery}/100
            </span>
            <span>MASTER {categoryMasteredCount}/{filteredStages.length}</span>
            <span>選んだマップ: {activeMastery.rankLabel}</span>
          </div>
          {filteredStages.map((stage) => {
            const isSelected = activeStageId === stage.id;
            const players = stagePlayerCounts[stage.id] || 0;
            const challengeCount = getStageChallenges(stage.id).length;
            const best = bestByStage[stage.id];
            const completedCount = best?.completedCount ?? 0;
            const medal = getStageChallengeMedal(completedCount, challengeCount);
            const medalLabel = getStageChallengeMedalLabel(medal);
            const condition = getStageCondition(stage.id);
            const runBonus = getStageRunBonus(stage.id, medal);
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
                onClick={() => setSelectedStageId(stage.id)}
                style={{
                  width: isTouch ? 154 : 188,
                  minHeight: isTouch ? 132 : 150,
                  padding: isTouch ? '8px 9px' : '10px 12px',
                  background: isSelected ? `${stage.color}55` : 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                  border: '2px solid',
                  borderColor: isSelected ? `${stage.color}cc` : 'rgba(255,255,255,0.2)',
                  borderRadius: 8,
                  color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: isSelected ? `0 0 18px ${stage.color}66` : 'none',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: isTouch ? 20 : 24 }}>{stage.icon}</div>
                <div style={{ fontSize: isTouch ? 12 : 14, fontWeight: 900, lineHeight: '16px' }}>{stage.name}</div>
                <div style={{
                  minHeight: isTouch ? 26 : 30,
                  fontSize: isTouch ? 9 : 10,
                  lineHeight: isTouch ? '13px' : '15px',
                  color: 'rgba(255,255,255,0.68)',
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
                        background: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.74)',
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
                  color: players > 0 ? '#4caf50' : 'rgba(255,255,255,0.4)',
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

        {/* 選択中ステージの差分ブリーフィング */}
        <div
          id="stage-briefing-panel"
          style={{
            width: briefingPanelWidth,
            marginBottom: isTouch ? 12 : 16,
            padding: isTouch ? '9px 10px' : '12px 14px',
            background: 'rgba(0,0,0,0.56)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            color: '#fff',
            boxShadow: `0 0 22px ${activeStage.color}33`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isTouch ? 8 : 10,
              marginBottom: isTouch ? 8 : 10,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: isTouch ? 18 : 22, flexShrink: 0 }}>{activeStage.icon}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: activeStage.color,
                  fontSize: isTouch ? 11 : 13,
                  fontWeight: 900,
                  lineHeight: '16px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeStage.rules.modeLabel}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: isTouch ? 10 : 12,
                  lineHeight: isTouch ? '14px' : '16px',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: compactLayout ? 2 : 1,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {activeStage.rules.objective.description}
              </div>
            </div>
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                alignItems: 'stretch',
              }}
            >
              <div
                style={{
                  padding: isTouch ? '4px 6px' : '5px 8px',
                  borderRadius: 6,
                  border: `1px solid ${activeMastery.mastered ? 'rgba(166,255,207,0.75)' : 'rgba(255,255,255,0.2)'}`,
                  color: activeMastery.accent,
                  background: activeMastery.mastered ? 'rgba(90,220,150,0.14)' : 'rgba(255,255,255,0.08)',
                  fontSize: isTouch ? 8 : 10,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                熟練 {activeMastery.score}%
              </div>
              <div
                style={{
                  padding: isTouch ? '4px 6px' : '5px 8px',
                  borderRadius: 6,
                  border: `1px solid ${activeMedal === 'gold' ? 'rgba(255,230,128,0.75)' : 'rgba(255,255,255,0.2)'}`,
                  color: activeMedal === 'gold' ? '#ffe680' : 'rgba(255,255,255,0.72)',
                  background: activeMedal === 'gold' ? 'rgba(255,200,60,0.14)' : 'rgba(255,255,255,0.08)',
                  fontSize: isTouch ? 8 : 10,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                }}
              >
                {activeMedalLabel}
              </div>
            </div>
          </div>

          <div
            className="stage-briefing-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: briefingColumns,
              gap: isTouch ? 6 : 8,
            }}
          >
            {activeBriefingSections.map((section) => (
              <div
                key={section.title}
                style={{
                  minWidth: 0,
                  padding: isTouch ? '7px 7px' : '8px 9px',
                  borderLeft: `3px solid ${section.accent}`,
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: 5,
                }}
              >
                <div
                  style={{
                    color: 'rgba(255,255,255,0.5)',
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
                    fontSize: isTouch ? 9 : 10,
                    fontWeight: 900,
                    lineHeight: isTouch ? '13px' : '14px',
                    minHeight: isTouch ? 25 : 28,
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
                      color: 'rgba(255,255,255,0.68)',
                      fontSize: isTouch ? 8 : 9,
                      lineHeight: isTouch ? '12px' : '13px',
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

        {/* 名前入力 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <label
            style={{
              color: 'rgba(255,255,255,0.8)',
              fontSize: isTouch ? 12 : 15,
              letterSpacing: 2,
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            なまえを入力してね
          </label>
          <div
            style={{
              display: 'flex',
              flexDirection: compactLayout ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: compactLayout ? 7 : 10,
            }}
          >
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
                width: isTouch ? 180 : 240,
                padding: isTouch ? '10px 14px' : '12px 16px',
                fontSize: isTouch ? 16 : 22,
                fontWeight: 700,
                textAlign: 'center',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '2px solid',
                borderColor: isValidName
                  ? 'rgba(100, 220, 100, 0.7)'
                  : 'rgba(255,255,255,0.2)',
                borderRadius: 10,
                color: '#fff',
                outline: 'none',
                letterSpacing: 4,
                transition: 'border-color 0.3s, box-shadow 0.3s',
                boxShadow: isValidName
                  ? '0 0 20px rgba(100, 220, 100, 0.3)'
                  : 'none',
                fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
              }}
            />

            <div
              id="start-game-button"
              onClick={handleStart}
              style={{
                minWidth: isTouch ? 180 : 210,
                padding: isTouch ? '10px 24px' : '13px 28px',
                background: isValidName
                  ? 'rgba(50, 180, 50, 0.35)'
                  : 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(4px)',
                border: '2px solid',
                borderColor: isValidName
                  ? 'rgba(100, 220, 100, 0.6)'
                  : 'rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: isValidName ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: isTouch ? 14 : 18,
                fontWeight: 800,
                letterSpacing: 2,
                animation: isValidName ? 'pulse 2s ease-in-out infinite' : 'none',
                transition: 'all 0.3s',
                pointerEvents: isValidName ? 'auto' : 'none',
                textShadow: isValidName ? '0 1px 4px rgba(0,0,0,0.6)' : 'none',
                cursor: isValidName ? 'pointer' : 'default',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              {isJoining ? '接続中...' : (isTouch ? 'タップでスタート' : 'クリックでスタート')}
            </div>
          </div>
          <span
            style={{
              color: 'rgba(255,255,255,0.4)',
              fontSize: 10,
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {name.trim().length}/8
          </span>
        </div>

        {/* スキン選択 */}
        <div style={{ marginTop: isTouch ? 8 : 12 }}>
          <SkinSelector compact />
        </div>

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

        {/* 操作説明 */}
        <div
          style={{
            marginTop: compactLayout ? 12 : 20,
            display: 'flex',
            flexDirection: compactLayout ? 'column' : 'row',
            gap: compactLayout ? 4 : 20,
            alignItems: 'center',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: compactLayout ? 10 : 12,
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}
        >
          {isTouch ? (
            <>
              <span>左スティック — 移動</span>
              <span>右スワイプ — 視点</span>
              <span>タップ — 破壊/設置</span>
              <span>▲ ボタン — ジャンプ / 2回で飛行</span>
            </>
          ) : (
            <>
              <span>WASD — 移動</span>
              <span>Space — ジャンプ</span>
              <span>建築: Space×2 — 飛行</span>
              <span>左クリック — 破壊</span>
              <span>右クリック — 設置</span>
              <span>V — 武器切替</span>
              <span>1-9 — ブロック選択</span>
              <span>F — ✈ 飛行機にのる</span>
            </>
          )}
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
