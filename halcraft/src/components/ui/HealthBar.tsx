// HPバーUIコンポーネント
// マイクラ風のハートアイコンでHPを表示
// 回復中はキラキラパルスエフェクト

import { usePlayerStore } from '../../stores/usePlayerStore';

/** 回復中かどうかを判定 */
function useIsRegenerating(): boolean {
  const hp = usePlayerStore((s) => s.hp);
  const maxHp = usePlayerStore((s) => s.maxHp);
  const lastDamageTime = usePlayerStore((s) => s.lastDamageTime);
  const isDead = usePlayerStore((s) => s.isDead);

  if (isDead || hp >= maxHp) return false;
  const now = performance.now() / 1000;
  return now - lastDamageTime >= 30; // REGEN_DELAYと同じ
}

/** ハートアイコン（SVG） */
function Heart({ filled, half, regenerating, index }: {
  filled: boolean;
  half?: boolean;
  regenerating?: boolean;
  index: number;
}) {
  // 回復中はパルスアニメーション（ハートごとに少しずらす）
  const pulseStyle = regenerating && filled ? {
    animation: `heartPulse 0.8s ease-in-out infinite`,
    animationDelay: `${index * 0.08}s`,
  } : {};

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      style={{ display: 'block', ...pulseStyle }}
    >
      {/* 背景（空のハート） */}
      <path
        d="M9 15.5L2.5 9C0.5 7 0.5 3.5 3 2C5.5 0.5 7.5 1 9 3C10.5 1 12.5 0.5 15 2C17.5 3.5 17.5 7 15.5 9L9 15.5Z"
        fill="#3a0a0a"
        stroke="#1a0505"
        strokeWidth="0.5"
      />
      {/* 塗りハート */}
      {filled && (
        <path
          d="M9 15.5L2.5 9C0.5 7 0.5 3.5 3 2C5.5 0.5 7.5 1 9 3C10.5 1 12.5 0.5 15 2C17.5 3.5 17.5 7 15.5 9L9 15.5Z"
          fill={half ? '#880000' : regenerating ? '#FF5555' : '#CC2222'}
          stroke={half ? '#550000' : regenerating ? '#FF3333' : '#991111'}
          strokeWidth="0.5"
        />
      )}
      {/* ハイライト */}
      {filled && !half && (
        <path
          d="M5 4C4.2 4.8 4.5 6 5 6.5"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* 回復キラキラ */}
      {regenerating && filled && !half && (
        <>
          <circle cx="5" cy="5" r="1" fill="rgba(255,255,200,0.8)">
            <animate attributeName="opacity" values="0;1;0" dur="1.2s" begin={`${index * 0.1}s`} repeatCount="indefinite" />
            <animate attributeName="r" values="0.5;1.5;0.5" dur="1.2s" begin={`${index * 0.1}s`} repeatCount="indefinite" />
          </circle>
          <circle cx="12" cy="6" r="0.8" fill="rgba(255,255,200,0.6)">
            <animate attributeName="opacity" values="0;0.8;0" dur="1.5s" begin={`${index * 0.12 + 0.3}s`} repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}

export function HealthBar() {
  const hp = usePlayerStore((s) => s.hp);
  const maxHp = usePlayerStore((s) => s.maxHp);
  const isRegenerating = useIsRegenerating();

  // ハートの数（1ハート = 2HP、マイクラ方式）
  const totalHearts = Math.ceil(maxHp / 2);
  const fullHearts = Math.floor(hp / 2);
  const hasHalf = hp % 2 === 1;

  return (
    <div
      id="health-bar"
      style={{
        position: 'fixed',
        bottom: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 1,
        zIndex: 100,
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      }}
    >
      {Array.from({ length: totalHearts }).map((_, i) => {
        const isFull = i < fullHearts;
        const isHalf = i === fullHearts && hasHalf;
        return (
          <Heart
            key={i}
            index={i}
            filled={isFull || isHalf}
            half={isHalf}
            regenerating={isRegenerating}
          />
        );
      })}
    </div>
  );
}
