// ランドマーク接近/到着の瞬間演出
// マップごとの起点に入った時、次に何を楽しむ場所かを短く返す

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import {
  formatStageLandmarkNavigation,
  getStageLandmarkBriefing,
  getStageLandmarkDistance,
  STAGE_LANDMARK_RADIUS,
} from '../../types/stageLandmarks';
import { isTouchDevice } from '../../utils/device';
import { useIsRideMode } from '../../utils/hudRideMode';
import { playStageLandmarkSound } from '../../utils/sounds';
import { HUD_TEXT_SHADOW, SG } from './startScreenTheme';

type LandmarkMomentKind = 'approach' | 'arrival';

interface LandmarkMoment {
  key: string;
  kind: LandmarkMomentKind;
  visibleUntil: number;
}

const APPROACH_RADIUS = STAGE_LANDMARK_RADIUS + 22;
const APPROACH_DISPLAY_MS = 3200;
const ARRIVAL_DISPLAY_MS = 4300;

function getMomentCopy(kind: LandmarkMomentKind, category: 'build' | 'war'): {
  eyebrow: string;
  title: string;
  meterText: string;
} {
  if (kind === 'arrival') {
    return category === 'build'
      ? { eyebrow: 'ランドマーク到着', title: 'ここから作品を育てよう', meterText: 'START' }
      : { eyebrow: 'ランドマーク到着', title: 'ここを守って迎え撃とう', meterText: 'READY' };
  }

  return category === 'build'
    ? { eyebrow: '目印接近', title: '制作エリアが見えてきた', meterText: 'NEAR' }
    : { eyebrow: '目印接近', title: '防衛拠点が近い', meterText: 'NEAR' };
}

export function StageLandmarkMomentHUD() {
  const phase = useGameStore((s) => s.phase);
  const stage = useGameStore((s) => s.currentStage);
  const runId = useGameStore((s) => s.runId);
  const playerPosition = usePlayerStore((s) => s.worldPosition);
  const rideMode = useIsRideMode();
  const [now, setNow] = useState(() => performance.now());
  const [moment, setMoment] = useState<LandmarkMoment | null>(null);
  const shownKeysRef = useRef(new Set<string>());
  const isCompact = isTouchDevice() || window.innerWidth <= 560;

  const briefing = useMemo(() => (stage ? getStageLandmarkBriefing(stage) : null), [stage]);
  const distance = getStageLandmarkDistance(playerPosition);
  const navigation = formatStageLandmarkNavigation(playerPosition);

  useEffect(() => {
    if (phase !== 'playing' || !stage || !briefing || distance === null) return;

    const runKey = `${runId}:${stage.id}`;
    const arrivalKey = `${runKey}:arrival`;
    const approachKey = `${runKey}:approach`;

    if (distance <= STAGE_LANDMARK_RADIUS && !shownKeysRef.current.has(arrivalKey)) {
      shownKeysRef.current.add(arrivalKey);
      const timer = window.setTimeout(() => {
        const nowMs = performance.now();
        setNow(nowMs);
        setMoment({ key: arrivalKey, kind: 'arrival', visibleUntil: nowMs + ARRIVAL_DISPLAY_MS });
        playStageLandmarkSound(stage.category === 'build' ? 'build' : 'war');
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (distance <= APPROACH_RADIUS && !shownKeysRef.current.has(approachKey)) {
      shownKeysRef.current.add(approachKey);
      const timer = window.setTimeout(() => {
        const nowMs = performance.now();
        setNow(nowMs);
        setMoment({ key: approachKey, kind: 'approach', visibleUntil: nowMs + APPROACH_DISPLAY_MS });
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [briefing, distance, phase, runId, stage]);

  useEffect(() => {
    if (!moment) return undefined;
    const timer = window.setInterval(() => setNow(performance.now()), 120);
    return () => window.clearInterval(timer);
  }, [moment]);

  // 搭乗中は中央上の瞬間演出を出さない
  if (phase !== 'playing' || !stage || !briefing || !moment || now > moment.visibleUntil || rideMode) return null;

  const copy = getMomentCopy(moment.kind, stage.category);
  const accent = moment.kind === 'arrival' ? '#fff1a8' : stage.color;
  const progress = Math.max(0, Math.min(1, (moment.visibleUntil - now) / (
    moment.kind === 'arrival' ? ARRIVAL_DISPLAY_MS : APPROACH_DISPLAY_MS
  )));

  return (
    <div
      id="stage-landmark-moment-hud"
      style={{
        position: 'fixed',
        top: isCompact ? 116 : 96,
        left: '50%',
        zIndex: 111,
        width: isCompact ? 'min(300px, calc(100vw - 28px))' : 390,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        color: '#fff',
        textShadow: HUD_TEXT_SHADOW,
        fontFamily: SG.font,
        animation: 'stageLandmarkMomentIn 0.22s ease-out both',
      }}
    >
      <div
        style={{
          padding: isCompact ? '9px 11px' : '10px 13px',
          borderRadius: 8,
          border: `1px solid ${accent}66`,
          background: `linear-gradient(135deg, ${stage.color}24, rgba(0,0,0,0.58))`,
          boxShadow: `0 10px 28px rgba(0,0,0,0.34), 0 0 24px ${stage.color}35`,
          backdropFilter: 'blur(9px)',
          WebkitBackdropFilter: 'blur(9px)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <span style={{ flex: '0 0 auto', fontSize: isCompact ? 17 : 20 }}>{stage.icon}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                color: accent,
                fontSize: isCompact ? 9 : 10,
                lineHeight: '12px',
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {copy.eyebrow} / {briefing.modeLabel}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 2,
                color: 'rgba(255,255,255,0.96)',
                fontSize: isCompact ? 13 : 15,
                lineHeight: isCompact ? '16px' : '18px',
                fontWeight: 950,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {briefing.name}: {copy.title}
            </span>
          </span>
          <span
            style={{
              flex: '0 0 auto',
              color: accent,
              fontSize: isCompact ? 10 : 11,
              lineHeight: '13px',
              fontWeight: 950,
              fontFamily: 'monospace',
              textAlign: 'right',
            }}
          >
            {copy.meterText}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            minWidth: 0,
            color: 'rgba(255,255,255,0.72)',
            fontSize: isCompact ? 10 : 11,
            lineHeight: '14px',
            fontWeight: 850,
          }}
        >
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {moment.kind === 'arrival' ? briefing.arrivalLabel : briefing.actionLabel}
          </span>
          <span style={{ flex: '0 0 auto', color: accent, fontFamily: 'monospace', fontWeight: 950 }}>
            {navigation}
          </span>
        </div>
        <div
          style={{
            marginTop: 7,
            height: 3,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.13)',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              borderRadius: 999,
              background: `linear-gradient(90deg, ${accent}, #ffffff)`,
            }}
          />
        </div>
      </div>
      <style>
        {`
          @keyframes stageLandmarkMomentIn {
            from { opacity: 0; transform: translate(-50%, -10px) scale(0.98); }
            to { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
        `}
      </style>
    </div>
  );
}
