// クロスヘア（照準）UIコンポーネント
// 乗り物搭乗中は非表示

import { useEffect, useMemo, useState } from 'react';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { useGameStore } from '../../stores/useGameStore';
import { useModeFlowStore } from '../../stores/useModeFlowStore';
import { usePlayerStore, type EquippedItem } from '../../stores/usePlayerStore';
import {
  getStageCombatStyle,
  getStageCombatStyleForItem,
  getStageCombatWeaponLabel,
} from '../../types/stageCombatStyles';
import { getStageModeRule } from '../../types/stageModeRules';
import { isTouchDevice } from '../../utils/device';

interface CrosshairProfile {
  color: string;
  glow: string;
  code: string;
  line: number;
  gap: number;
}

const CROSSHAIR_PROFILES: Record<EquippedItem, CrosshairProfile> = {
  builder: {
    color: 'rgba(255,255,255,0.88)',
    glow: 'rgba(0,0,0,0.62)',
    code: 'BUILD',
    line: 12,
    gap: 0,
  },
  rocket_launcher: {
    color: '#ffc06d',
    glow: 'rgba(255, 120, 48, 0.5)',
    code: 'RKT',
    line: 13,
    gap: 7,
  },
  machine_gun: {
    color: '#ffe28a',
    glow: 'rgba(255, 220, 90, 0.44)',
    code: 'BURST',
    line: 8,
    gap: 12,
  },
  lightsaber: {
    color: '#c8b0ff',
    glow: 'rgba(170, 130, 255, 0.5)',
    code: 'COMBO',
    line: 12,
    gap: 5,
  },
};

function getChargeForItem(item: EquippedItem, rocketCharge: number, attackCharge: number): number {
  if (item === 'rocket_launcher') return rocketCharge;
  if (item === 'lightsaber') return attackCharge;
  return 1;
}

function formatReticleSeconds(remainingMs: number): string {
  return `${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
}

export function Crosshair() {
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const creativeFlying = useGameStore((s) => s.creativeFlying);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const rocketCharge = usePlayerStore((s) => s.rocketCharge);
  const attackCharge = usePlayerStore((s) => s.attackCharge);
  const worldPosition = usePlayerStore((s) => s.worldPosition);
  const buildFocusUntil = useModeFlowStore((s) => s.buildFocusUntil);
  const buildFocusChain = useModeFlowStore((s) => s.buildFocusChain);
  const buildFocusChainExpiresAt = useModeFlowStore((s) => s.buildFocusChainExpiresAt);
  const combatFocusUntil = useModeFlowStore((s) => s.combatFocusUntil);
  const combatFocusItem = useModeFlowStore((s) => s.combatFocusItem);
  const combatFocusRank = useModeFlowStore((s) => s.combatFocusRank);
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const currentNow = performance.now();
    if (buildFocusUntil <= currentNow && combatFocusUntil <= currentNow) return undefined;
    const updateNow = () => setNow(performance.now());
    const firstTick = window.setTimeout(updateNow, 0);
    const timer = window.setInterval(updateNow, 120);
    return () => {
      window.clearTimeout(firstTick);
      window.clearInterval(timer);
    };
  }, [buildFocusUntil, combatFocusUntil]);
  const modeRule = useMemo(() => getStageModeRule(currentStageId), [currentStageId]);

  // 乗り物搭乗中は専用照準に任せる
  if (activeVehicle !== null) return null;

  const profile = CROSSHAIR_PROFILES[equippedItem];
  const charge = Math.max(0, Math.min(1, getChargeForItem(equippedItem, rocketCharge, attackCharge)));
  const recommendedStageStyle = getStageCombatStyle(currentStageId);
  const stageStyle = getStageCombatStyleForItem(currentStageId, equippedItem);
  const isBuilder = equippedItem === 'builder';
  const buildFocusActive = isBuilder && modeRule?.category === 'build' && buildFocusUntil > now;
  const combatFocusActive = !isBuilder && combatFocusItem === equippedItem && combatFocusUntil > now;
  const buildFlightActive = isBuilder && isBuildMode && creativeFlying;
  const flightAltitude = Math.max(0, Math.round(worldPosition?.y ?? 0));
  const buildFocusSeconds = formatReticleSeconds(buildFocusUntil - now);
  const combatFocusSeconds = formatReticleSeconds(combatFocusUntil - now);
  const activeBuildFocusChain = buildFocusChainExpiresAt > now ? buildFocusChain : 0;
  const builderFocusAccent = buildFocusActive ? modeRule.accent : profile.color;
  const combatFocusAccent = combatFocusActive ? (stageStyle?.accent ?? profile.color) : profile.color;
  const activeColor = buildFocusActive ? builderFocusAccent : combatFocusActive ? combatFocusAccent : profile.color;
  const activeGlow = buildFocusActive
    ? `${builderFocusAccent}88`
    : combatFocusActive
      ? `${combatFocusAccent}aa`
      : profile.glow;
  const isCompact = isTouchDevice() || window.innerWidth <= 560;
  const isRocketReloading = equippedItem === 'rocket_launcher' && charge < 1;
  const isRocketReady = equippedItem === 'rocket_launcher' && charge >= 1;
  const recommendedWeaponLabel = recommendedStageStyle
    ? getStageCombatWeaponLabel(recommendedStageStyle.weapon)
    : null;
  const mapStatusLabel = stageStyle
    ? 'MAP MATCH'
    : recommendedWeaponLabel && !isBuilder
      ? `MAP ${recommendedWeaponLabel}へ`
      : null;
  const stageAccent = stageStyle?.accent ?? recommendedStageStyle?.accent ?? activeColor;
  const tacticalStatusLabel = buildFocusActive
    ? `FAST ${buildFocusSeconds}`
    : combatFocusActive
      ? `FOCUS ${combatFocusSeconds}`
      : isRocketReloading
        ? `RELOAD ${Math.round(charge * 100)}%`
        : isRocketReady
          ? 'RKT READY'
          : equippedItem === 'lightsaber'
            ? `COMBO ${Math.round(charge * 100)}%`
            : equippedItem === 'machine_gun'
              ? stageStyle
                ? 'LOW SPREAD'
                : 'BURST READY'
              : profile.code;
  const ringSize = equippedItem === 'machine_gun' ? 42 : 36;
  const arms = [
    {
      key: 'left',
      width: profile.line,
      height: 2,
      transform: `translate(calc(-100% - ${profile.gap}px), -50%)`,
    },
    {
      key: 'right',
      width: profile.line,
      height: 2,
      transform: `translate(${profile.gap}px, -50%)`,
    },
    {
      key: 'top',
      width: 2,
      height: profile.line,
      transform: `translate(-50%, calc(-100% - ${profile.gap}px))`,
    },
    {
      key: 'bottom',
      width: 2,
      height: profile.line,
      transform: `translate(-50%, ${profile.gap}px)`,
    },
  ];
  const label = combatFocusActive
    ? `${profile.code} FOCUS${Math.max(1, combatFocusRank)}`
    : stageStyle
      ? `${profile.code} MAP`
      : isRocketReloading
      ? `${profile.code} ${Math.round(charge * 100)}%`
      : profile.code;

  return (
    <div
      id="crosshair"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      {!isCompact && mapStatusLabel && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -42px)',
            minWidth: 62,
            height: 14,
            padding: '0 6px',
            borderRadius: 4,
            border: `1px solid ${stageAccent}66`,
            background: stageStyle ? `${stageAccent}22` : 'rgba(0, 0, 0, 0.5)',
            color: stageAccent,
            fontSize: 8,
            lineHeight: '14px',
            fontWeight: 950,
            fontFamily: 'monospace',
            letterSpacing: 0,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            textShadow: '0 1px 2px rgba(0,0,0,0.88)',
            boxShadow: stageStyle ? `0 0 10px ${stageAccent}33` : '0 0 8px rgba(0,0,0,0.4)',
          }}
        >
          {mapStatusLabel}
        </div>
      )}

      {!isBuilder && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: ringSize,
            height: ringSize,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: `conic-gradient(${activeColor} ${Math.round(charge * 360)}deg, rgba(255,255,255,0.16) 0deg)`,
            WebkitMask: 'radial-gradient(circle, transparent 55%, #000 58%)',
            mask: 'radial-gradient(circle, transparent 55%, #000 58%)',
            filter: `drop-shadow(0 0 ${combatFocusActive ? 9 : 5}px ${activeGlow})`,
            opacity: combatFocusActive ? 0.92 : equippedItem === 'machine_gun' ? 0.68 : 0.82,
            animation: combatFocusActive ? 'builderFocusReticle 0.66s ease-in-out infinite alternate' : undefined,
          }}
        />
      )}

      {stageStyle && !isBuilder && (
        <>
          {[-1, 1].map((side) => (
            <div
              key={`stage-reticle-${side}`}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 5,
                height: 18,
                transform: `translate(${side < 0 ? '-31px' : '26px'}, -50%)`,
                borderTop: `1px solid ${stageAccent}`,
                borderBottom: `1px solid ${stageAccent}`,
                borderLeft: side < 0 ? `1px solid ${stageAccent}` : undefined,
                borderRight: side > 0 ? `1px solid ${stageAccent}` : undefined,
                opacity: combatFocusActive ? 0.95 : 0.68,
                boxShadow: `0 0 ${combatFocusActive ? 10 : 6}px ${stageAccent}66`,
              }}
            />
          ))}
        </>
      )}

      {buildFlightActive && (
        <>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: buildFocusActive ? 58 : 50,
              height: buildFocusActive ? 58 : 50,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `1px solid ${(modeRule?.accent ?? '#9bdcff')}66`,
              boxShadow: `0 0 12px ${(modeRule?.accent ?? '#9bdcff')}44, inset 0 0 10px rgba(255,255,255,0.08)`,
              opacity: buildFocusActive ? 0.44 : 0.7,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: isCompact
                ? `translate(-50%, ${buildFocusActive ? 38 : 24}px)`
                : 'translate(22px, -50%)',
              width: isCompact ? 58 : 72,
              height: 16,
              borderRadius: 4,
              border: `1px solid ${(modeRule?.accent ?? '#9bdcff')}55`,
              background: 'rgba(8, 17, 24, 0.52)',
              color: modeRule?.accent ?? '#9bdcff',
              fontSize: 8,
              lineHeight: '16px',
              fontWeight: 950,
              fontFamily: 'monospace',
              letterSpacing: 0,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              textShadow: '0 1px 2px rgba(0,0,0,0.84)',
              boxShadow: `0 0 9px ${(modeRule?.accent ?? '#9bdcff')}33`,
            }}
          >
            FLY Y{flightAltitude}
          </div>
          {!isCompact && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -42px)',
                height: 14,
                padding: '0 6px',
                borderRadius: 4,
                border: '1px solid rgba(155, 220, 255, 0.32)',
                background: 'rgba(8, 15, 22, 0.44)',
                color: 'rgba(220, 245, 255, 0.92)',
                fontSize: 8,
                lineHeight: '14px',
                fontWeight: 900,
                fontFamily: 'monospace',
                letterSpacing: 0,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.86)',
              }}
            >
              SPACE UP / SHIFT DOWN
            </div>
          )}
        </>
      )}

      {isBuilder && buildFocusActive && (
        <>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 44,
              height: 44,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `1px solid ${builderFocusAccent}aa`,
              boxShadow: `0 0 10px ${builderFocusAccent}66, inset 0 0 8px ${builderFocusAccent}33`,
              opacity: 0.82,
              animation: 'builderFocusReticle 0.72s ease-in-out infinite alternate',
            }}
          />
          {!isCompact && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, 24px)',
                padding: '1px 6px',
                borderRadius: 4,
                border: `1px solid ${builderFocusAccent}66`,
                background: 'rgba(13, 22, 12, 0.52)',
                color: builderFocusAccent,
                fontSize: 8,
                lineHeight: '10px',
                fontWeight: 950,
                fontFamily: 'monospace',
                letterSpacing: 0,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              FAST {buildFocusSeconds} x{Math.max(1, activeBuildFocusChain)}
            </div>
          )}
        </>
      )}

      {arms.map((arm) => (
        <div
          key={arm.key}
          style={{
            position: 'absolute',
            width: arm.width,
            height: arm.height,
            background: activeColor,
            left: '50%',
            top: '50%',
            transform: arm.transform,
            boxShadow: `0 0 2px rgba(0,0,0,0.6), 0 0 8px ${activeGlow}`,
          }}
        />
      ))}
      {!isBuilder && (
        <>
          <div
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: profile.color,
              boxShadow: `0 0 9px ${profile.glow}`,
            }}
          />
          {equippedItem === 'machine_gun' && (
            <>
              {[
                ['-50%', 'calc(-50% - 19px)'],
                ['-50%', 'calc(-50% + 19px)'],
                ['calc(-50% - 19px)', '-50%'],
                ['calc(-50% + 19px)', '-50%'],
              ].map(([x, y]) => (
                <div
                  key={`${x}-${y}`}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 5,
                    height: 5,
                    transform: `translate(${x}, ${y})`,
                    borderRadius: 2,
                    border: `1px solid ${profile.color}`,
                    boxShadow: `0 0 6px ${profile.glow}`,
                  }}
                />
              ))}
            </>
          )}
          {!isCompact && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-97px, -50%)',
                width: 68,
                padding: '1px 5px',
                borderRadius: 4,
                border: `1px solid ${activeColor}55`,
                background: combatFocusActive ? 'rgba(30, 20, 6, 0.56)' : 'rgba(0,0,0,0.42)',
                color: activeColor,
                fontSize: 8,
                lineHeight: '10px',
                fontWeight: 900,
                fontFamily: 'monospace',
                letterSpacing: 0,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              {label}
            </div>
          )}
          {!isCompact && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(25px, -50%)',
                width: 72,
                height: 14,
                borderRadius: 4,
                border: `1px solid ${activeColor}44`,
                background: combatFocusActive || isRocketReady ? `${activeColor}1f` : 'rgba(0, 0, 0, 0.38)',
                color: activeColor,
                fontSize: 8,
                lineHeight: '14px',
                fontWeight: 950,
                fontFamily: 'monospace',
                letterSpacing: 0,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.82)',
                boxShadow: combatFocusActive || isRocketReady ? `0 0 9px ${activeGlow}` : undefined,
              }}
            >
              {tacticalStatusLabel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
