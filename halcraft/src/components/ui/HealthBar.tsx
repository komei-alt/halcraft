// HPバーUIコンポーネント
// マイクラ風のハートアイコンでHPを表示

import { usePlayerStore } from '../../stores/usePlayerStore';

/** ハートアイコン（SVG） */
function Heart({ filled, half }: { filled: boolean; half?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ display: 'block' }}>
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
          fill={half ? '#880000' : '#CC2222'}
          stroke={half ? '#550000' : '#991111'}
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
    </svg>
  );
}

export function HealthBar() {
  const hp = usePlayerStore((s) => s.hp);
  const maxHp = usePlayerStore((s) => s.maxHp);

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
          <Heart key={i} filled={isFull || isHalf} half={isHalf} />
        );
      })}
    </div>
  );
}
