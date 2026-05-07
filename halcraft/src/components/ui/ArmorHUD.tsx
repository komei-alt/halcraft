// 防具スロットHUD — 装備中の防具アイコンと防御力を表示
// HealthBar の上に表示

import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
import { ARMOR_DEFS, type ArmorSlot } from '../../types/armor';

const SLOT_ORDER: ArmorSlot[] = ['helmet', 'chestplate', 'leggings', 'boots'];

export function ArmorHUD() {
  const equippedArmor = usePlayerStore((s) => s.equippedArmor);
  const armorDurability = usePlayerStore((s) => s.armorDurability);
  const totalDefense = usePlayerStore((s) => s.getTotalDefense());
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'playing' || isBuildMode) return null;

  // 何も装備していなければ非表示
  const hasArmor = SLOT_ORDER.some((slot) => equippedArmor[slot]);
  if (!hasArmor) return null;

  return (
    <div
      id="armor-hud"
      style={{
        position: 'fixed',
        bottom: 100,
        left: '50%',
        transform: 'translateX(-80px)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {/* 防御力アイコン */}
      <div style={{
        fontSize: 11,
        color: '#A0E0FF',
        fontWeight: 700,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        marginRight: 4,
      }}>
        🛡️{totalDefense}
      </div>

      {/* 防具スロット */}
      {SLOT_ORDER.map((slot) => {
        const armorId = equippedArmor[slot];
        if (!armorId) {
          return (
            <div
              key={slot}
              style={{
                width: 18,
                height: 18,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 2,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
          );
        }

        const def = ARMOR_DEFS[armorId];
        if (!def) return null;

        const durability = armorDurability[armorId] ?? 0;
        const ratio = durability / def.maxDurability;
        const barColor = ratio > 0.5 ? '#4CAF50' : ratio > 0.2 ? '#f0ad4e' : '#e74c3c';

        return (
          <div
            key={slot}
            style={{
              width: 18,
              height: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span style={{
              fontSize: 12,
              filter: ratio < 0.2 ? 'saturate(0.3)' : 'none',
            }}>
              {def.emoji}
            </span>
            {/* ミニ耐久値バー */}
            <div style={{
              position: 'absolute',
              bottom: -2,
              left: 1,
              right: 1,
              height: 2,
              background: 'rgba(0,0,0,0.4)',
              borderRadius: 1,
            }}>
              <div style={{
                width: `${ratio * 100}%`,
                height: '100%',
                background: barColor,
                borderRadius: 1,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
