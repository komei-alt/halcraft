// ツールHUD — 装備中のツール名・耐久値バーを表示
// サバイバルモードのみ表示

import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { TOOL_DEFS } from '../../types/tools';

export function ToolHUD() {
  const equippedToolId = usePlayerStore((s) => s.equippedToolId);
  const tools = usePlayerStore((s) => s.tools);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'playing' || isBuildMode || !equippedToolId) return null;

  const def = TOOL_DEFS[equippedToolId];
  if (!def) return null;

  const durability = tools[equippedToolId] ?? 0;
  const durabilityRatio = durability / def.maxDurability;

  // 耐久値に応じた色
  const barColor = durabilityRatio > 0.5
    ? `hsl(${120 * durabilityRatio}, 80%, 50%)`
    : durabilityRatio > 0.2
      ? '#f0ad4e'
      : '#e74c3c';

  return (
    <div
      id="tool-hud"
      style={{
        position: 'fixed',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {/* ツール名 */}
      <div style={{
        fontSize: 11,
        color: def.color,
        fontWeight: 700,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        letterSpacing: '0.05em',
      }}>
        {def.emoji} {def.name}
      </div>

      {/* 耐久値バー */}
      <div style={{
        width: 80,
        height: 3,
        background: 'rgba(0,0,0,0.5)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${durabilityRatio * 100}%`,
          height: '100%',
          background: barColor,
          transition: 'width 0.2s ease, background 0.2s ease',
          borderRadius: 2,
        }} />
      </div>
    </div>
  );
}
