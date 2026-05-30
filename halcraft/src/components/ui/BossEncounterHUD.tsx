// ボス戦専用HUD
// 出現中のボスのHP、弱点、召喚、報酬を一目で読めるようにする

import { useEffect, useMemo, useRef } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { useMobStore } from '../../stores/useMobStore';
import {
  formatStageBossReward,
  getStageBossEncounter,
  getStageBossEncounterById,
} from '../../types/stageBossEncounters';
import { isTouchDevice } from '../../utils/device';
import { playBossSpawnSound } from '../../utils/sounds';

export function BossEncounterHUD() {
  const phase = useGameStore((s) => s.phase);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const boss = useMobStore((s) => s.mobs.find((mob) => mob.type === 'boss_giant') ?? null);
  const lastAnnouncedBossId = useRef<string | null>(null);
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const encounter = useMemo(
    () => getStageBossEncounterById(boss?.bossEncounterId) ?? getStageBossEncounter(currentStageId),
    [boss?.bossEncounterId, currentStageId],
  );

  useEffect(() => {
    if (phase !== 'playing' || !boss) return;
    if (lastAnnouncedBossId.current === boss.id) return;
    lastAnnouncedBossId.current = boss.id;
    playBossSpawnSound();
  }, [boss, phase]);

  if (phase !== 'playing' || !boss || isCompact) return null;

  const accent = encounter?.accent ?? boss.traitAccent ?? '#ffdd66';
  const title = encounter?.title ?? boss.traitLabel ?? '巨大ボス';
  const weakness = encounter?.weakness ?? '火力を集中して距離を取る';
  const summonLabel = boss.bossSummonLabel ?? encounter?.summonLabel ?? '取り巻きを召喚';
  const rewardLabel = encounter ? formatStageBossReward(encounter) : '撃破で大量XP';
  const hpRatio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
  const hpPercent = Math.max(0, Math.ceil(hpRatio * 100));
  const danger = hpRatio <= 0.32;

  return (
    <div
      id="boss-encounter-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 'auto' : 14,
        bottom: isCompact ? 'calc(168px + env(safe-area-inset-bottom))' : 'auto',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 118,
        width: isCompact ? 'min(340px, calc(100vw - 28px))' : 430,
        padding: isCompact ? '9px 11px' : '10px 13px',
        borderRadius: 8,
        border: `1px solid ${accent}88`,
        background: danger
          ? 'linear-gradient(135deg, rgba(58, 12, 15, 0.76), rgba(16, 12, 16, 0.68))'
          : 'linear-gradient(135deg, rgba(16, 13, 18, 0.78), rgba(22, 18, 20, 0.64))',
        boxShadow: `0 0 24px ${accent}44, inset 0 1px 0 rgba(255,255,255,0.15)`,
        backdropFilter: 'blur(11px)',
        WebkitBackdropFilter: 'blur(11px)',
        color: '#fff',
        pointerEvents: 'none',
        fontFamily: "'Segoe UI', 'Hiragino Sans', sans-serif",
        animation: 'masteryPulse 0.28s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: isCompact ? 36 : 40,
            height: isCompact ? 36 : 40,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            background: `${accent}24`,
            border: `1px solid ${accent}77`,
            boxShadow: `0 0 16px ${accent}44`,
            fontSize: isCompact ? 21 : 23,
            flex: '0 0 auto',
          }}
        >
          {encounter?.icon ?? '👑'}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              minWidth: 0,
            }}
          >
            <div
              style={{
                minWidth: 0,
                color: accent,
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 950,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              ボス決戦 / {summonLabel}
            </div>
            <div
              style={{
                flex: '0 0 auto',
                color: danger ? '#ffb4a8' : 'rgba(255,255,255,0.78)',
                fontSize: isCompact ? 10 : 11,
                lineHeight: '13px',
                fontWeight: 950,
                fontFamily: 'monospace',
              }}
            >
              {hpPercent}%
            </div>
          </div>
          <div
            style={{
              marginTop: 2,
              color: '#fff',
              fontSize: isCompact ? 15 : 17,
              lineHeight: isCompact ? '18px' : '20px',
              fontWeight: 950,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          height: isCompact ? 7 : 8,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            width: `${hpRatio * 100}%`,
            height: '100%',
            borderRadius: 999,
            background: danger
              ? `linear-gradient(90deg, #ff5f6d, ${accent}, #fff)`
              : `linear-gradient(90deg, ${accent}, #ffe680, #fff)`,
            boxShadow: `0 0 14px ${accent}66`,
            transition: 'width 0.22s ease',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 7,
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1fr auto',
          gap: isCompact ? 3 : 10,
          color: 'rgba(255,255,255,0.68)',
          fontSize: isCompact ? 10 : 11,
          lineHeight: '14px',
          fontWeight: 850,
        }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          弱点: {weakness}
        </span>
        <span
          style={{
            minWidth: 0,
            color: 'rgba(255,255,255,0.56)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          報酬: {rewardLabel}
        </span>
      </div>
    </div>
  );
}
