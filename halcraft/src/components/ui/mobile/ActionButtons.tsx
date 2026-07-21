// モバイルアクションボタン群
// 右側に配置：武器・乗り物・建築の「今のマップで効く行動」を短い状態で返す

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../../../stores/useGameStore';
import { getScaledStageModeReward, useModeFlowStore } from '../../../stores/useModeFlowStore';
import { usePlayerStore, type EquippedItem } from '../../../stores/usePlayerStore';
import { useStageChallengeStore } from '../../../stores/useStageChallengeStore';
import { useVehicleStore, type VehicleType } from '../../../stores/useVehicleStore';
import { BLOCK_DEFS } from '../../../types/blocks';
import { getStageBuildBlockScore, getStageBuildStyle } from '../../../types/stageBuildStyles';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeMetric,
} from '../../../types/stageChallenges';
import {
  getStageCombatStyleForItem,
} from '../../../types/stageCombatStyles';
import { getStageModeRule } from '../../../types/stageModeRules';
import { clearAllMobileActions, mobileActions } from '../../../utils/touchInput';

const BUTTON_SIZE = 48;
const RIGHT = 20;
const LEFT_ATTACK = 56;
const PRIMARY_ATTACK_BOTTOM = 172;
const BASE_BOTTOM = 64 + 80;
const STACK_GAP = 12;

type TouchHandler = (e: React.TouchEvent) => void;

interface ButtonTone {
  background: string;
  border: string;
  color: string;
  accent: string;
  glow: string;
}

interface ActionButtonProps {
  icon: ReactNode;
  bottom: number;
  tone: ButtonTone;
  ariaLabel: string;
  badge?: string | null;
  meterRatio?: number | null;
  pulse?: boolean;
  placement?: 'right-stack' | 'left-attack';
  onTouchStart: TouchHandler;
  onTouchEnd?: TouchHandler;
  onTouchCancel?: TouchHandler;
}

const TONES: Record<string, ButtonTone> = {
  builder: {
    background: 'rgba(120, 180, 255, 0.18)',
    border: '2px solid rgba(170, 215, 255, 0.34)',
    color: 'rgba(235, 248, 255, 0.84)',
    accent: '#b6e2ff',
    glow: 'rgba(120, 190, 255, 0.24)',
  },
  buildScore: {
    background: 'rgba(100, 200, 100, 0.2)',
    border: '2px solid rgba(130, 230, 130, 0.45)',
    color: 'rgba(236, 255, 232, 0.88)',
    accent: '#a8f28b',
    glow: 'rgba(120, 230, 140, 0.28)',
  },
  breakMode: {
    background: 'rgba(255, 100, 100, 0.2)',
    border: '2px solid rgba(255, 120, 120, 0.42)',
    color: 'rgba(255, 235, 235, 0.82)',
    accent: '#ff9c9c',
    glow: 'rgba(255, 100, 100, 0.24)',
  },
  craft: {
    background: 'rgba(255, 255, 255, 0.08)',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    color: 'rgba(255, 255, 255, 0.72)',
    accent: '#ffffff',
    glow: 'rgba(255, 255, 255, 0.18)',
  },
  machineGun: {
    background: 'rgba(255, 220, 100, 0.2)',
    border: '2px solid rgba(255, 230, 130, 0.4)',
    color: 'rgba(255, 245, 220, 0.88)',
    accent: '#ffe28a',
    glow: 'rgba(255, 220, 90, 0.28)',
  },
  rocket: {
    background: 'rgba(255, 150, 80, 0.22)',
    border: '2px solid rgba(255, 170, 110, 0.42)',
    color: 'rgba(255, 245, 220, 0.88)',
    accent: '#ffc06d',
    glow: 'rgba(255, 150, 72, 0.3)',
  },
  lightsaber: {
    background: 'rgba(170, 130, 255, 0.22)',
    border: '2px solid rgba(190, 160, 255, 0.42)',
    color: 'rgba(255, 245, 255, 0.88)',
    accent: '#c8b0ff',
    glow: 'rgba(170, 130, 255, 0.3)',
  },
  bomb: {
    background: 'rgba(255, 80, 50, 0.25)',
    border: '2px solid rgba(255, 120, 80, 0.5)',
    color: 'rgba(255, 245, 220, 0.88)',
    accent: '#ff9a66',
    glow: 'rgba(255, 95, 70, 0.3)',
  },
  interact: {
    background: 'rgba(100, 210, 170, 0.2)',
    border: '2px solid rgba(130, 230, 190, 0.42)',
    color: 'rgba(230, 255, 245, 0.88)',
    accent: '#8ef0c8',
    glow: 'rgba(100, 210, 170, 0.28)',
  },
};

const buttonBaseStyle: CSSProperties = {
  position: 'fixed',
  right: RIGHT,
  width: BUTTON_SIZE,
  height: BUTTON_SIZE,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 120,
  touchAction: 'none',
  WebkitTapHighlightColor: 'transparent',
  fontSize: 20,
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  overflow: 'visible',
};

const iconStyle: CSSProperties = {
  position: 'relative',
  zIndex: 2,
  lineHeight: 1,
};

function getBottom(level: number): number {
  return BASE_BOTTOM + level * (BUTTON_SIZE + STACK_GAP);
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function findChallengeProgress(
  stageId: string | null,
  metric: StageChallengeMetric,
  stats: ReturnType<typeof useStageChallengeStore.getState>['stats'],
  completedIds: string[],
): string | null {
  const challenge = getStageChallenges(stageId)
    .find((item) => item.metric === metric && !completedIds.includes(item.id));
  if (!challenge) return null;
  const progress = getStageChallengeProgress(challenge, stats);
  if (progress.completed) return null;
  return `${Math.min(progress.current, progress.target)}/${progress.target}`;
}

function getCombatMetric(item: EquippedItem): StageChallengeMetric | null {
  if (item === 'machine_gun') return 'machine_gun_hits';
  if (item === 'rocket_launcher') return 'rocket_hits';
  if (item === 'lightsaber') return 'lightsaber_hits';
  return null;
}

function getActionTone(item: EquippedItem, matched: boolean, focused: boolean): ButtonTone {
  if (item === 'machine_gun') {
    if (focused) {
      return {
        ...TONES.machineGun,
        background: 'rgba(255, 229, 104, 0.28)',
        border: '2px solid rgba(255, 248, 188, 0.9)',
        glow: 'rgba(255, 224, 92, 0.5)',
      };
    }
    return matched ? { ...TONES.machineGun, border: '2px solid rgba(255, 238, 160, 0.72)' } : TONES.machineGun;
  }
  if (item === 'rocket_launcher') {
    if (focused) {
      return {
        ...TONES.rocket,
        background: 'rgba(255, 159, 80, 0.3)',
        border: '2px solid rgba(255, 220, 146, 0.92)',
        glow: 'rgba(255, 158, 76, 0.54)',
      };
    }
    return matched ? { ...TONES.rocket, border: '2px solid rgba(255, 196, 109, 0.72)' } : TONES.rocket;
  }
  if (item === 'lightsaber') {
    if (focused) {
      return {
        ...TONES.lightsaber,
        background: 'rgba(182, 139, 255, 0.3)',
        border: '2px solid rgba(222, 203, 255, 0.92)',
        glow: 'rgba(180, 135, 255, 0.55)',
      };
    }
    return matched ? { ...TONES.lightsaber, border: '2px solid rgba(210, 185, 255, 0.72)' } : TONES.lightsaber;
  }
  return TONES.builder;
}

function getRuntimeNow(): number {
  if (typeof performance !== 'undefined') return performance.now();
  return Date.now();
}

function formatFocusBadge(rank: number, remainingMs: number): string {
  return `F${Math.max(1, rank)} ${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
}

function getVehicleTactic(stageId: string | null, activeVehicle: VehicleType): {
  badge: string | null;
  meterRatio: number | null;
  pulse: boolean;
} {
  const modeRule = getStageModeRule(stageId);
  if (stageId !== 'war-desert' || modeRule?.category !== 'war') {
    return { badge: activeVehicle === 'airplane' ? '空' : '車', meterRatio: null, pulse: false };
  }

  const meter = useModeFlowStore.getState().meter;
  return {
    badge: '戦意+',
    meterRatio: clampRatio(meter / modeRule.threshold),
    pulse: true,
  };
}

function ActionButton({
  icon,
  bottom,
  tone,
  ariaLabel,
  badge,
  meterRatio,
  pulse,
  placement = 'right-stack',
  onTouchStart,
  onTouchEnd,
  onTouchCancel,
}: ActionButtonProps) {
  const positionStyle: CSSProperties = placement === 'left-attack'
    ? {
        left: LEFT_ATTACK,
        right: 'auto',
      }
    : {
        right: RIGHT,
      };

  return (
    <div
      aria-label={ariaLabel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={{
        ...buttonBaseStyle,
        ...positionStyle,
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`,
        background: tone.background,
        border: tone.border,
        color: tone.color,
        boxShadow: pulse
          ? `0 0 18px ${tone.glow}, inset 0 0 12px ${tone.glow}`
          : `0 0 10px ${tone.glow}`,
      }}
    >
      {pulse && (
        <span
          style={{
            position: 'absolute',
            inset: -4,
            borderRadius: 10,
            border: `1px solid ${tone.accent}66`,
            opacity: 0.75,
            animation: 'mobileActionPulse 1.2s ease-in-out infinite',
          }}
        />
      )}
      <span style={iconStyle}>{icon}</span>
      {badge && (
        <span
          style={{
            position: 'absolute',
            right: -6,
            top: -7,
            minWidth: 26,
            maxWidth: 68,
            padding: '2px 5px',
            borderRadius: 999,
            background: 'rgba(12, 15, 20, 0.82)',
            border: `1px solid ${tone.accent}99`,
            color: tone.accent,
            fontSize: 8,
            lineHeight: '10px',
            fontWeight: 950,
            fontFamily: 'monospace',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: `0 0 8px ${tone.glow}`,
          }}
        >
          {badge}
        </span>
      )}
      {typeof meterRatio === 'number' && (
        <span
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 5,
            height: 3,
            borderRadius: 999,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.14)',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${Math.round(clampRatio(meterRatio) * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${tone.accent}, #ffffff)`,
              boxShadow: `0 0 6px ${tone.glow}`,
            }}
          />
        </span>
      )}
      <style>{`
        @keyframes mobileActionPulse {
          0%, 100% { transform: scale(1); opacity: 0.58; }
          50% { transform: scale(1.08); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

interface VehicleActionsProps {
  activeVehicle: VehicleType;
  stageId: string | null;
  challengeStats: ReturnType<typeof useStageChallengeStore.getState>['stats'];
  completedChallengeIds: string[];
  onGunStart: TouchHandler;
  onGunEnd: TouchHandler;
  onRocket: TouchHandler;
  onBomb: TouchHandler;
  onInteract: TouchHandler;
}

function VehicleActions({
  activeVehicle,
  stageId,
  challengeStats,
  completedChallengeIds,
  onGunStart,
  onGunEnd,
  onRocket,
  onBomb,
  onInteract,
}: VehicleActionsProps) {
  const tactic = getVehicleTactic(stageId, activeVehicle);
  const vehicleProgress = findChallengeProgress(stageId, 'vehicle_hits', challengeStats, completedChallengeIds);
  const secondaryTone = activeVehicle === 'tank' ? TONES.rocket : TONES.bomb;
  const hasCombatControls = activeVehicle === 'tank' || activeVehicle === 'airplane';

  return (
    <>
      {hasCombatControls && (
        <>
          <ActionButton
            ariaLabel={activeVehicle === 'tank' ? '戦車ガトリング' : '飛行機機銃'}
            badge={tactic.badge}
            bottom={PRIMARY_ATTACK_BOTTOM}
            icon="🔫"
            meterRatio={tactic.meterRatio}
            onTouchCancel={onGunEnd}
            onTouchEnd={onGunEnd}
            onTouchStart={onGunStart}
            placement="left-attack"
            pulse={tactic.pulse}
            tone={TONES.machineGun}
          />
          <ActionButton
            ariaLabel={activeVehicle === 'tank' ? '戦車主砲' : '飛行機爆弾'}
            badge={vehicleProgress ?? (activeVehicle === 'tank' ? '主砲' : '空爆')}
            bottom={getBottom(1)}
            icon={activeVehicle === 'tank' ? '💥' : '💣'}
            meterRatio={tactic.meterRatio}
            onTouchStart={activeVehicle === 'tank' ? onRocket : onBomb}
            pulse={tactic.pulse}
            tone={secondaryTone}
          />
        </>
      )}
      <ActionButton
        ariaLabel="乗り物から降りる"
        badge="降りる"
        bottom={getBottom(hasCombatControls ? 2 : 0)}
        icon="🚪"
        onTouchStart={onInteract}
        tone={TONES.interact}
      />
    </>
  );
}

interface WalkingActionsProps {
  isPlaceMode: boolean;
  equippedItem: EquippedItem;
  selectedBlockName: string;
  buildBadge: string | null;
  buildProgressRatio: number | null;
  combatBadge: string | null;
  combatProgress: string | null;
  combatFocusActive: boolean;
  combatFocusBadge: string | null;
  combatFocusRatio: number | null;
  combatMatched: boolean;
  onRocket: TouchHandler;
  onMachineGunStart: TouchHandler;
  onMachineGunEnd: TouchHandler;
  onLightsaber: TouchHandler;
  onTogglePlace: TouchHandler;
  onCrafting: TouchHandler;
  onInteract: TouchHandler;
}

function WalkingActions({
  isPlaceMode,
  equippedItem,
  selectedBlockName,
  buildBadge,
  buildProgressRatio,
  combatBadge,
  combatProgress,
  combatFocusActive,
  combatFocusBadge,
  combatFocusRatio,
  combatMatched,
  onRocket,
  onMachineGunStart,
  onMachineGunEnd,
  onLightsaber,
  onTogglePlace,
  onCrafting,
  onInteract,
}: WalkingActionsProps) {
  const actionTone = getActionTone(equippedItem, combatMatched, combatFocusActive);

  return (
    <>
      {equippedItem === 'rocket_launcher' ? (
        <ActionButton
          ariaLabel="ロケット発射"
          badge={combatFocusBadge ?? combatProgress ?? combatBadge}
          bottom={PRIMARY_ATTACK_BOTTOM}
          icon="💥"
          meterRatio={combatFocusActive ? combatFocusRatio : combatMatched ? buildProgressRatio : null}
          onTouchStart={onRocket}
          placement="left-attack"
          pulse={combatFocusActive || combatMatched}
          tone={combatFocusActive ? actionTone : TONES.rocket}
        />
      ) : equippedItem === 'machine_gun' ? (
        <ActionButton
          ariaLabel="機関銃"
          badge={combatFocusBadge ?? combatProgress ?? combatBadge}
          bottom={PRIMARY_ATTACK_BOTTOM}
          icon="🔫"
          meterRatio={combatFocusActive ? combatFocusRatio : combatMatched ? buildProgressRatio : null}
          onTouchCancel={onMachineGunEnd}
          onTouchEnd={onMachineGunEnd}
          onTouchStart={onMachineGunStart}
          placement="left-attack"
          pulse={combatFocusActive || combatMatched}
          tone={combatFocusActive ? actionTone : TONES.machineGun}
        />
      ) : equippedItem === 'lightsaber' ? (
        <ActionButton
          ariaLabel="ライトセイバー"
          badge={combatFocusBadge ?? combatProgress ?? combatBadge}
          bottom={PRIMARY_ATTACK_BOTTOM}
          icon="⚔️"
          meterRatio={combatFocusActive ? combatFocusRatio : combatMatched ? buildProgressRatio : null}
          onTouchStart={onLightsaber}
          placement="left-attack"
          pulse={combatFocusActive || combatMatched}
          tone={combatFocusActive ? actionTone : TONES.lightsaber}
        />
      ) : (
        <ActionButton
          ariaLabel={isPlaceMode ? `ブロック設置 ${selectedBlockName}` : 'ブロック破壊'}
          badge={isPlaceMode ? buildBadge : null}
          bottom={getBottom(0)}
          icon={isPlaceMode ? '🧱' : '⛏️'}
          meterRatio={isPlaceMode ? buildProgressRatio : null}
          onTouchStart={onTogglePlace}
          pulse={Boolean(isPlaceMode && buildBadge)}
          tone={isPlaceMode && buildBadge ? TONES.buildScore : isPlaceMode ? TONES.builder : TONES.breakMode}
        />
      )}

      <ActionButton
        ariaLabel="クラフト"
        bottom={getBottom(1)}
        icon="🔧"
        onTouchStart={onCrafting}
        tone={TONES.craft}
      />
      <ActionButton
        ariaLabel="乗り物に乗る"
        badge="乗る"
        bottom={getBottom(2)}
        icon="🚗"
        onTouchStart={onInteract}
        tone={TONES.interact}
      />
    </>
  );
}

interface ActionButtonsProps {
  /** クラフト画面を開くコールバック */
  onOpenCrafting: () => void;
}

export function ActionButtons({ onOpenCrafting }: ActionButtonsProps) {
  const currentStageId = useGameStore((s) => s.currentStageId);
  const isPlaceMode = usePlayerStore((s) => s.isPlaceMode);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const selectedBlock = usePlayerStore((s) => s.getSelectedBlock());
  const togglePlaceMode = usePlayerStore((s) => s.togglePlaceMode);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const challengeStats = useStageChallengeStore((s) => s.stats);
  const completedChallengeIds = useStageChallengeStore((s) => s.completedIds);
  const modeMeter = useModeFlowStore((s) => s.meter);
  const combatFocusUntil = useModeFlowStore((s) => s.combatFocusUntil);
  const combatFocusItem = useModeFlowStore((s) => s.combatFocusItem);
  const combatFocusRank = useModeFlowStore((s) => s.combatFocusRank);
  const [now, setNow] = useState(() => getRuntimeNow());

  // ポーズやタブ離脱で押しっぱなし射撃が残らないようにする
  useEffect(() => {
    const clearHeld = () => clearAllMobileActions();
    const onVisibility = () => {
      if (document.hidden) clearHeld();
    };
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', onVisibility);
      clearHeld();
    };
  }, []);

  useEffect(() => {
    // 乗り物切替時に徒歩機関銃の押しっぱなしを解除
    mobileActions.fireMachineGun = false;
    mobileActions.vehicleGun = false;
  }, [activeVehicle]);

  useEffect(() => {
    const currentNow = getRuntimeNow();
    if (combatFocusUntil <= currentNow) return undefined;
    const updateNow = () => setNow(getRuntimeNow());
    const firstTick = window.setTimeout(updateNow, 0);
    const timer = window.setInterval(() => {
      const nextNow = getRuntimeNow();
      setNow(nextNow);
      if (combatFocusUntil <= nextNow) {
        window.clearInterval(timer);
      }
    }, 160);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [combatFocusUntil]);

  const matchedCombatStyle = getStageCombatStyleForItem(currentStageId, equippedItem);
  const stageBuildStyle = getStageBuildStyle(currentStageId);
  const buildBlockScore = getStageBuildBlockScore(currentStageId, selectedBlock);
  const modeRule = getStageModeRule(currentStageId);
  const combatMetric = getCombatMetric(equippedItem);
  const combatProgress = combatMetric
    ? findChallengeProgress(currentStageId, combatMetric, challengeStats, completedChallengeIds)
    : null;
  const selectedBlockName = BLOCK_DEFS[selectedBlock]?.name ?? 'ブロック';
  const buildBadge = buildBlockScore
    ? `${buildBlockScore.label}+${buildBlockScore.points}`
    : stageBuildStyle
      ? '作品+'
      : null;
  const meterRatio = modeRule ? clampRatio(modeMeter / modeRule.threshold) : null;
  const combatFocusRemainingMs = Math.max(0, combatFocusUntil - now);
  const combatFocusActive = combatFocusItem === equippedItem && combatFocusRemainingMs > 0;
  const combatFocusDurationMs = modeRule && combatFocusRank > 0
    ? getScaledStageModeReward(modeRule, combatFocusRank).combatFocusMs
    : 0;
  const combatFocusRatio = combatFocusActive && combatFocusDurationMs > 0
    ? clampRatio(combatFocusRemainingMs / combatFocusDurationMs)
    : null;
  const combatFocusBadge = combatFocusActive
    ? formatFocusBadge(combatFocusRank, combatFocusRemainingMs)
    : null;
  const combatBadge = matchedCombatStyle
    ? '戦意+'
    : null;

  // 設置/破壊モード切替
  const handleTogglePlace = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlaceMode();
  }, [togglePlaceMode]);

  // クラフト画面開閉
  const handleCrafting = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenCrafting();
  }, [onOpenCrafting]);

  // ロケット発射
  const handleRocket = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireRocket = true;
  }, []);

  const handleMachineGunStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireMachineGun = true;
  }, []);

  const handleMachineGunEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireMachineGun = false;
  }, []);

  const handleLightsaber = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.breakBlock = true;
  }, []);

  const handleVehicleGunStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleGun = true;
  }, []);

  const handleVehicleGunEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleGun = false;
  }, []);

  const handleVehicleRocket = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleRocket = true;
  }, []);

  const handleVehicleBomb = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleBomb = true;
  }, []);

  const handleInteract = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.interact = true;
  }, []);

  if (activeVehicle !== null) {
    return (
      <VehicleActions
        activeVehicle={activeVehicle}
        challengeStats={challengeStats}
        completedChallengeIds={completedChallengeIds}
        onBomb={handleVehicleBomb}
        onGunEnd={handleVehicleGunEnd}
        onGunStart={handleVehicleGunStart}
        onInteract={handleInteract}
        onRocket={handleVehicleRocket}
        stageId={currentStageId}
      />
    );
  }

  return (
    <WalkingActions
      buildBadge={buildBadge}
      buildProgressRatio={meterRatio}
      combatBadge={combatBadge}
      combatFocusActive={combatFocusActive}
      combatFocusBadge={combatFocusBadge}
      combatFocusRatio={combatFocusRatio}
      combatMatched={Boolean(matchedCombatStyle)}
      combatProgress={combatProgress}
      equippedItem={equippedItem}
      isPlaceMode={isPlaceMode}
      onCrafting={handleCrafting}
      onInteract={handleInteract}
      onLightsaber={handleLightsaber}
      onMachineGunEnd={handleMachineGunEnd}
      onMachineGunStart={handleMachineGunStart}
      onRocket={handleRocket}
      onTogglePlace={handleTogglePlace}
      selectedBlockName={selectedBlockName}
    />
  );
}
