import { useDialogueStore } from '../../stores/useDialogueStore';
import { isTouchDevice } from '../../utils/device';

const ACCENT = {
  guide: '#7edcff',
  ally: '#8ff0a4',
  warning: '#ff9a72',
  victory: '#ffd86b',
} as const;

export function DialogueSubtitle() {
  const active = useDialogueStore((state) => state.active);
  if (!active) return null;
  const isTouch = isTouchDevice();
  const accent = ACCENT[active.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-dialogue-id={active.id}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: isTouch ? 'calc(174px + env(safe-area-inset-bottom))' : 102,
        zIndex: 190,
        width: 'min(720px, calc(100vw - 32px))',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        display: 'grid',
        justifyItems: 'center',
      }}
    >
      <div style={{
        maxWidth: '100%',
        padding: isTouch ? '9px 13px 10px' : '10px 18px 12px',
        borderRadius: 14,
        border: `1px solid ${accent}66`,
        borderLeft: `4px solid ${accent}`,
        background: 'rgba(5, 9, 16, 0.86)',
        boxShadow: '0 12px 35px rgba(0,0,0,0.32)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        textAlign: 'center',
      }}>
        <div style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', marginBottom: 3 }}>
          {active.speaker}
        </div>
        <div style={{ color: '#fff', fontSize: isTouch ? 14 : 16, fontWeight: 800, lineHeight: 1.5, textShadow: '0 2px 8px #000' }}>
          {active.text}
        </div>
      </div>
    </div>
  );
}
