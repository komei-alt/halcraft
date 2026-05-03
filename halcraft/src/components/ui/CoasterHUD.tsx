// ジェットコースターHUD v2
// エネルギー保存の可視化・物理量表示・チェーンリフトインジケーター

import { useCoasterStore } from '../../stores/useCoasterStore';
import { useGameStore } from '../../stores/useGameStore';
import { COASTER_MAX_SPEED } from '../../utils/coasterPhysics';

const HUD_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: 100,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  pointerEvents: 'none',
  zIndex: 100,
  fontFamily: '"Press Start 2P", "Courier New", monospace',
};

const PANEL_STYLE: React.CSSProperties = {
  width: 268,
  padding: '9px 10px',
  background: 'linear-gradient(180deg, rgba(8, 12, 18, 0.78), rgba(5, 8, 12, 0.62))',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
};

const BAR_CONTAINER: React.CSSProperties = {
  width: 244,
  height: 16,
  background: 'rgba(0, 0, 0, 0.6)',
  borderRadius: 4,
  border: '1px solid rgba(255, 255, 255, 0.2)',
  overflow: 'hidden',
  position: 'relative',
};

const ENERGY_BAR_CONTAINER: React.CSSProperties = {
  width: 244,
  height: 10,
  background: 'rgba(0, 0, 0, 0.4)',
  borderRadius: 3,
  overflow: 'hidden',
  display: 'flex',
};

const LABEL: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.9)',
  fontSize: 10,
  textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  letterSpacing: 1,
};

const SUB_LABEL: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.6)',
  fontSize: 7,
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
};

const INFO_ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: 244,
  gap: 8,
};

const CONTROLS: React.CSSProperties = {
  color: 'rgba(255, 255, 255, 0.4)',
  fontSize: 7,
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  marginTop: 2,
};

export function CoasterHUD() {
  const isBoarded = useCoasterStore((s) => s.isBoarded);
  const speed = useCoasterStore((s) => s.speed);
  const cartY = useCoasterStore((s) => s.cartY);
  const braking = useCoasterStore((s) => s.braking);
  const onChainLift = useCoasterStore((s) => s.onChainLift);
  const kineticEnergy = useCoasterStore((s) => s.kineticEnergy);
  const potentialEnergy = useCoasterStore((s) => s.potentialEnergy);
  const gForce = useCoasterStore((s) => s.gForce);
  const loopSafety = useCoasterStore((s) => s.loopSafety);
  const slopeGrade = useCoasterStore((s) => s.slopeGrade);
  const trackLength = useCoasterStore((s) => s.trackLength);
  const trackDrop = useCoasterStore((s) => s.trackDrop);
  const trackScore = useCoasterStore((s) => s.trackScore);
  const trackLoops = useCoasterStore((s) => s.trackLoops);
  const trackBoosters = useCoasterStore((s) => s.trackBoosters);
  const trackChains = useCoasterStore((s) => s.trackChains);
  const phase = useGameStore((s) => s.phase);

  if (!isBoarded || phase !== 'playing') return null;

  const absSpeed = Math.abs(speed);
  const speedPercent = Math.min(100, (absSpeed / COASTER_MAX_SPEED) * 100);
  const speedKmh = Math.round(absSpeed * 3.6);
  const height = Math.round(cartY);

  // エネルギー比率（位置 + 運動 = 全体）
  const totalEnergy = kineticEnergy + potentialEnergy;
  const kePercent = totalEnergy > 0 ? (kineticEnergy / totalEnergy) * 100 : 0;
  const pePercent = totalEnergy > 0 ? (potentialEnergy / totalEnergy) * 100 : 0;

  // 速度に応じた色
  const speedColor =
    speedPercent > 80 ? '#ff3333' :
    speedPercent > 50 ? '#ffaa00' :
    speedPercent > 25 ? '#44dd44' :
    '#88bbff';

  // G力の色
  const gColor =
    gForce > 3 ? '#ff3333' :
    gForce > 2 ? '#ffaa00' :
    gForce > 1.5 ? '#ffdd44' :
    '#88ff88';
  const loopColor =
    loopSafety < 0.9 ? '#ff5555' :
    loopSafety < 1.15 ? '#ffcc44' :
    '#8cff9a';
  const scoreColor =
    trackScore >= 80 ? '#8cff9a' :
    trackScore >= 60 ? '#ffdd66' :
    '#88bbff';

  return (
    <div style={HUD_STYLE}>
      <div style={PANEL_STYLE}>
        {/* チェーンリフトインジケーター */}
        {onChainLift && (
          <div style={{
            color: '#FFD700',
            fontSize: 9,
            textShadow: '0 0 6px rgba(255,215,0,0.6)',
            letterSpacing: 2,
          }}>
            CHAIN LIFT
          </div>
        )}

        {/* 速度表示 */}
        <div style={LABEL}>
          {speedKmh} km/h
        </div>

        {/* 速度バー */}
        <div style={BAR_CONTAINER}>
          <div style={{
            width: `${speedPercent}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${speedColor}cc, ${speedColor})`,
            transition: 'width 0.08s linear',
            boxShadow: speedPercent > 60 ? `0 0 8px ${speedColor}66` : 'none',
          }} />
          {braking && (
            <div style={{
              position: 'absolute', top: 0, right: 4, bottom: 0,
              display: 'flex', alignItems: 'center',
              color: '#ff4444', fontSize: 8, fontWeight: 'bold',
            }}>BRAKE</div>
          )}
        </div>

        {/* エネルギーバー（運動エネルギー=青、位置エネルギー=オレンジ） */}
        <div style={SUB_LABEL}>ENERGY</div>
        <div style={ENERGY_BAR_CONTAINER}>
          <div style={{
            width: `${kePercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #4488ff, #66aaff)',
            transition: 'width 0.1s linear',
          }} />
          <div style={{
            width: `${pePercent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #ff8844, #ffaa66)',
            transition: 'width 0.1s linear',
          }} />
        </div>
        <div style={{ ...INFO_ROW, fontSize: 6, color: 'rgba(255,255,255,0.58)' }}>
          <span>運動 {Math.round(kineticEnergy)}</span>
          <span>位置 {Math.round(potentialEnergy)}</span>
        </div>

        {/* 物理情報行 */}
        <div style={INFO_ROW}>
          <span style={SUB_LABEL}>高度 Y{height}</span>
          <span style={SUB_LABEL}>勾配 {Math.round(slopeGrade)}%</span>
          <span style={{ ...SUB_LABEL, color: gColor }}>{gForce.toFixed(1)}G</span>
        </div>

        {/* コース設計情報 */}
        <div style={INFO_ROW}>
          <span style={{ ...SUB_LABEL, color: scoreColor }}>設計 {trackScore}</span>
          <span style={SUB_LABEL}>全長 {Math.round(trackLength)}m</span>
          <span style={SUB_LABEL}>落差 {Math.round(trackDrop)}m</span>
        </div>
        <div style={INFO_ROW}>
          <span style={SUB_LABEL}>輪 {trackLoops}</span>
          <span style={SUB_LABEL}>加速 {trackBoosters}</span>
          <span style={SUB_LABEL}>巻上 {trackChains}</span>
          {trackLoops > 0 && (
            <span style={{ ...SUB_LABEL, color: loopColor }}>ループ {loopSafety.toFixed(1)}x</span>
          )}
        </div>

        {/* 操作ガイド */}
        <div style={CONTROLS}>
          Space: 発進/ブレーキ F: 降車
        </div>
      </div>
    </div>
  );
}
