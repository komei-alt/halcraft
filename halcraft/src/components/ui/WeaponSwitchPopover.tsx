// 武器切替時に現在の装備と操作を短時間案内するポップオーバー

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { getMasteryProgress, getMasteryTitle, useMasteryStore } from '../../stores/useMasteryStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { useStageChallengeStore } from '../../stores/useStageChallengeStore';
import { getMasteryPerkSummary } from '../../types/masteryPerks';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeDefinition,
  type StageChallengeMetric,
  type StageChallengeStats,
} from '../../types/stageChallenges';
import {
  formatStageCombatBonus,
  getStageCombatStyle,
  getStageCombatStyleForItem,
  getStageCombatWeaponLabel,
} from '../../types/stageCombatStyles';
import {
  formatMasteryTechniqueBonus,
  getMasteryTechniqueBonus,
  getMasteryTechniqueProgress,
} from '../../types/masteryTechniquePerks';
import { getStageModeRule } from '../../types/stageModeRules';
import { isTouchDevice } from '../../utils/device';

const SHOW_DURATION_MS = 2200;
const TRANSITION_MS = 220;

interface PopoverContent {
  icon: string;
  title: string;
  subtitle: string;
  controls: string[];
  accent: string;
  glow: string;
}

interface ChallengeHint {
  icon: string;
  title: string;
  progressLabel: string;
  detail: string;
  ratio: number;
  accent: string;
}

const CONTENT_BY_ITEM: Record<EquippedItem, PopoverContent> = {
  builder: {
    icon: '⛏️',
    title: '建築モード',
    subtitle: 'ブロック破壊と設置が使えます',
    controls: [
      '左クリック: こわす / 攻撃',
      '右クリック: ブロック設置',
      '1-9 / ホイール: 武器も選べる',
    ],
    accent: '#b6e2ff',
    glow: 'rgba(116, 194, 255, 0.28)',
  },
  rocket_launcher: {
    icon: '🚀',
    title: 'ロケット装備',
    subtitle: '広範囲にダメージを与える重火器です',
    controls: [
      '左クリック または R: 発射',
      '遠距離直撃: ダメージと戦意アップ',
      '爆風: 周囲まとめてダメージ',
      '1-9 / ホイール: 持ち替え',
    ],
    accent: '#ffc48a',
    glow: 'rgba(255, 145, 72, 0.3)',
  },
  machine_gun: {
    icon: '🔫',
    title: '機関銃装備',
    subtitle: '弱めの弾を連射する徒歩用武器です',
    controls: [
      '左クリック長押し: 連射',
      '右クリック長押し: スコープ',
      '1-9 / ホイール: 持ち替え',
    ],
    accent: '#ffe28a',
    glow: 'rgba(255, 220, 90, 0.28)',
  },
  lightsaber: {
    icon: '⚔️',
    title: 'ライトセイバー',
    subtitle: '光の剣でコンボ斬りを繰り出す近接武器です',
    controls: [
      '左クリック: コンボ攻撃（5段）',
      '連続クリックでコンボが繋がる',
      '1-9 / ホイール: ブロックへ戻る',
    ],
    accent: '#c8b0ff',
    glow: 'rgba(170, 130, 255, 0.3)',
  },
};

function getMobileContent(item: EquippedItem): PopoverContent {
  const base = CONTENT_BY_ITEM[item];
  if (item === 'builder') {
    return {
      ...base,
      controls: [
        'タップ: こわす',
        '長押し: ブロック設置',
        'ホットバーで武器も選べる',
      ],
    };
  }

  if (item === 'rocket_launcher') {
    return {
      ...base,
      controls: [
        '💥 ボタン: ロケット発射',
        '遠距離直撃: ダメージと戦意アップ',
        '爆風: 周囲まとめてダメージ',
        'ホットバーで持ち替え',
      ],
    };
  }

  if (item === 'machine_gun') {
    return {
      ...base,
      controls: [
        '🔫 ボタン長押し: 連射',
        '小ダメージ / 低反動',
        'ホットバーで持ち替え',
      ],
    };
  }

  if (item === 'lightsaber') {
    return {
      ...base,
      controls: [
        'タップ: コンボ攻撃',
        '連続タップでコンボが繋がる',
        'ホットバーでブロックへ戻る',
      ],
    };
  }

  return base;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getCombatMetric(item: EquippedItem): StageChallengeMetric | null {
  if (item === 'machine_gun') return 'machine_gun_hits';
  if (item === 'rocket_launcher') return 'rocket_hits';
  if (item === 'lightsaber') return 'lightsaber_hits';
  return null;
}

function getPreferredChallengeMetrics(item: EquippedItem): StageChallengeMetric[] {
  if (item === 'builder') {
    return ['block_group_placed', 'blocks_placed', 'ores_mined', 'blocks_broken'];
  }

  const combatMetric = getCombatMetric(item);
  return [
    ...(combatMetric ? [combatMetric] : []),
    'enemies_defeated',
    'boss_defeated',
    'detonations',
    'vehicle_hits',
    'block_group_placed',
  ];
}

function pickChallenge(
  challenges: StageChallengeDefinition[],
  stats: StageChallengeStats,
  completedIds: string[],
  preferredMetrics: StageChallengeMetric[],
): StageChallengeDefinition | null {
  const unfinished = challenges.filter((challenge) => {
    if (completedIds.includes(challenge.id)) return false;
    return !getStageChallengeProgress(challenge, stats).completed;
  });
  if (unfinished.length === 0) return null;

  for (const metric of preferredMetrics) {
    const matched = unfinished.find((challenge) => challenge.metric === metric);
    if (matched) return matched;
  }

  return unfinished[0] ?? null;
}

function getChallengeHint(
  stageId: string | null,
  item: EquippedItem,
  stats: StageChallengeStats,
  completedIds: string[],
): ChallengeHint | null {
  const challenge = pickChallenge(
    getStageChallenges(stageId),
    stats,
    completedIds,
    getPreferredChallengeMetrics(item),
  );
  if (!challenge) return null;

  const progress = getStageChallengeProgress(challenge, stats);
  const current = Math.min(progress.current, progress.target);
  return {
    icon: challenge.icon,
    title: challenge.title,
    progressLabel: `${current}/${progress.target}`,
    detail: challenge.description,
    ratio: progress.ratio,
    accent: challenge.accent,
  };
}

export function WeaponSwitchPopover() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const masteryItems = useMasteryStore((s) => s.items);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const isTouch = isTouchDevice();
  const dismissTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [displayItem, setDisplayItem] = useState<EquippedItem>(equippedItem);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hidePopover = useCallback(() => {
    clearTimers();
    setEntered(false);
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setVisible(false);
    }, TRANSITION_MS);
  }, [clearTimers]);

  const showItemPopover = useCallback((item: EquippedItem) => {
    clearTimers();

    setDisplayItem(item);
    setVisible(true);
    setEntered(true);
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      hidePopover();
    }, SHOW_DURATION_MS);
  }, [clearTimers, hidePopover]);

  useEffect(() => {
    if (phase !== 'playing') {
      clearTimers();
      const timer = window.setTimeout(() => {
        setEntered(false);
        setVisible(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    return usePlayerStore.subscribe((state, previous) => {
      if (state.equippedItem === previous.equippedItem) return;
      showItemPopover(state.equippedItem);
    });
  }, [clearTimers, phase, showItemPopover]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible || phase !== 'playing') return null;

  const content = isTouch ? getMobileContent(displayItem) : CONTENT_BY_ITEM[displayItem];
  const mastery = masteryItems[displayItem];
  const masteryProgress = mastery ? getMasteryProgress(mastery) : 0;
  const masteryTitle = mastery ? getMasteryTitle(displayItem, mastery.level) : '';
  const masteryPerk = mastery ? getMasteryPerkSummary(displayItem, mastery.level) : '';
  const techniqueBonus = mastery ? getMasteryTechniqueBonus(displayItem, mastery) : null;
  const techniqueProgress = mastery ? getMasteryTechniqueProgress(displayItem, mastery) : null;
  const stageStyle = getStageCombatStyleForItem(currentStageId, displayItem);
  const recommendedStageStyle = getStageCombatStyle(currentStageId);
  const tacticStyle = stageStyle ?? recommendedStageStyle;
  const tacticMatched = Boolean(stageStyle);
  const modeRule = getStageModeRule(currentStageId);
  const modeRatio = modeRule ? clampRatio(modeMeter / modeRule.threshold) : 0;
  const modeMeterValue = modeRule ? Math.min(Math.floor(modeMeter), modeRule.threshold) : 0;
  const challengeHint = getChallengeHint(currentStageId, displayItem, challengeStats, completedChallengeIds);
  const hasStageContext = Boolean(tacticStyle || modeRule || challengeHint);

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: isTouch ? 'calc(126px + env(safe-area-inset-bottom))' : 106,
        transform: entered
          ? 'translateX(-50%) translateY(0) scale(1)'
          : 'translateX(-50%) translateY(14px) scale(0.96)',
        opacity: entered ? 1 : 0,
        transition: `transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease`,
        zIndex: 135,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: 24,
          background: `radial-gradient(circle, ${content.glow} 0%, rgba(0,0,0,0) 72%)`,
          filter: 'blur(12px)',
        }}
      />
      <div
        style={{
          position: 'relative',
          minWidth: isTouch ? 248 : 290,
          maxWidth: isTouch ? 286 : 340,
          padding: isTouch ? '12px 14px' : '12px 16px',
          borderRadius: 16,
          border: `1px solid ${content.glow}`,
          background: 'rgba(12, 15, 20, 0.84)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 18px 40px rgba(0, 0, 0, 0.38)',
          fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              width: isTouch ? 38 : 42,
              height: isTouch ? 38 : 42,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isTouch ? 22 : 24,
              background: `${content.glow}`,
              border: `1px solid ${content.accent}55`,
              boxShadow: `0 0 0 1px ${content.accent}14 inset`,
            }}
          >
            {content.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: isTouch ? 15 : 16,
                fontWeight: 800,
                letterSpacing: 0,
                color: content.accent,
              }}
            >
              {content.title}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: isTouch ? 11 : 12,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              {content.subtitle}
            </div>
          </div>
        </div>

        {mastery && (
          <div
            style={{
              marginTop: 10,
              padding: '7px 8px',
              borderRadius: 7,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${content.accent}2f`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                color: 'rgba(255,255,255,0.84)',
                fontSize: isTouch ? 10 : 11,
                fontWeight: 900,
                lineHeight: '13px',
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Lv.{mastery.level} {masteryTitle}
              </span>
              <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
                {mastery.xp}/{mastery.xpToNextLevel}
              </span>
            </div>
            <div
              style={{
                marginTop: 5,
                height: 4,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.12)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${masteryProgress * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${content.accent}, #ffffff)`,
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 5,
                color: content.accent,
                fontSize: isTouch ? 9 : 10,
                lineHeight: '13px',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              特典: {masteryPerk}
            </div>
            {techniqueBonus && techniqueProgress && (
              <div
                style={{
                  marginTop: 5,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    color: 'rgba(255,255,255,0.76)',
                    fontSize: isTouch ? 9 : 10,
                    lineHeight: '12px',
                    fontWeight: 900,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    技: {techniqueBonus.tierLabel} {formatMasteryTechniqueBonus(displayItem, techniqueBonus)}
                  </span>
                  <span style={{ flex: '0 0 auto', color: content.accent, fontFamily: 'monospace' }}>
                    {techniqueProgress.valueText}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round(techniqueProgress.ratio * 100)}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${content.accent}, #ffffff)`,
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: isTouch ? 9 : 10,
                    lineHeight: '12px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {techniqueProgress.nextTargetText}
                </div>
              </div>
            )}
          </div>
        )}

        {hasStageContext && (
          <div
            style={{
              marginTop: 9,
              padding: '7px 8px 8px',
              borderRadius: 7,
              background: `${(tacticStyle?.accent ?? modeRule?.accent ?? challengeHint?.accent ?? content.accent)}16`,
              border: `1px solid ${(tacticStyle?.accent ?? modeRule?.accent ?? challengeHint?.accent ?? content.accent)}44`,
              color: 'rgba(255,255,255,0.84)',
              fontSize: isTouch ? 10 : 11,
              lineHeight: '14px',
              fontWeight: 850,
            }}
          >
            {tacticStyle && (
              <>
                <div
                  style={{
                    color: tacticStyle.accent,
                    fontWeight: 950,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tacticStyle.icon} {tacticMatched
                    ? `マップ戦術一致: ${tacticStyle.title}`
                    : `おすすめ武器: ${getStageCombatWeaponLabel(tacticStyle.weapon)}`}
                </div>
                <div
                  style={{
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tacticMatched
                    ? `${formatStageCombatBonus(tacticStyle)} / 戦意+`
                    : `${tacticStyle.shortLabel}: ${formatStageCombatBonus(tacticStyle)}`}
                </div>
              </>
            )}

            {modeRule && (
              <div
                style={{
                  marginTop: tacticStyle ? 7 : 0,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    color: modeRule.accent,
                    fontWeight: 950,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {modeRule.icon} {modeRule.meterLabel}
                  </span>
                  <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
                    {modeMeterValue}/{modeRule.threshold}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.13)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${modeRatio * 100}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${modeRule.accent}, #ffffff)`,
                      transition: 'width 0.18s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  次: {modeRule.actionLabel}
                </div>
              </div>
            )}

            {challengeHint && (
              <div
                style={{
                  marginTop: modeRule || tacticStyle ? 7 : 0,
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    color: challengeHint.accent,
                    fontWeight: 950,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {challengeHint.icon} マップ目標: {challengeHint.title}
                  </span>
                  <span style={{ flex: '0 0 auto', fontFamily: 'monospace' }}>
                    {challengeHint.progressLabel}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.13)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${challengeHint.ratio * 100}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${challengeHint.accent}, #ffffff)`,
                      transition: 'width 0.18s ease',
                    }}
                  />
                </div>
                <div
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {challengeHint.detail}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {content.controls.map((control) => (
            <div
              key={control}
              style={{
                fontSize: isTouch ? 11 : 12,
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 1.35,
              }}
            >
              {control}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
