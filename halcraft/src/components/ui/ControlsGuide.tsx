// 操作ガイドUI
// 歩行時・乗り物搭乗時で異なる操作方法を表示
// 右下に常時表示（コンパクトなデザインで邪魔にならない）
// Hキーで表示/非表示を切り替え可能

import { useState, useEffect } from 'react';
import { useVehicleStore, SEAT_NAMES } from '../../stores/useVehicleStore';
import type { SeatType } from '../../stores/useVehicleStore';
import { isTouchDevice } from '../../utils/device';

/** キーバッジのスタイル */
function KeyBadge({ children, color = '#ffdd00' }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      background: 'rgba(255, 255, 255, 0.12)',
      color,
      fontSize: '10px',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      padding: '1px 5px',
      borderRadius: '3px',
      border: `1px solid ${color}44`,
      lineHeight: '14px',
      minWidth: '16px',
      textAlign: 'center',
    }}>
      {children}
    </span>
  );
}

/** 操作行のスタイル */
function ControlRow({ keyName, action, keyColor }: { keyName: string; action: string; keyColor?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      lineHeight: '16px',
    }}>
      <KeyBadge color={keyColor}>{keyName}</KeyBadge>
      <span style={{
        color: 'rgba(255, 255, 255, 0.55)',
        fontSize: '10px',
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
      }}>
        {action}
      </span>
    </div>
  );
}

/** セクション区切り */
function Divider() {
  return (
    <div style={{
      width: '100%',
      height: '1px',
      background: 'rgba(255, 255, 255, 0.08)',
      margin: '2px 0',
    }} />
  );
}

/** 歩行時の操作ガイド */
function WalkingControls() {
  return (
    <>
      <ControlRow keyName="W A S D" action="移動" />
      <ControlRow keyName="Shift / Q / WW" action="ダッシュ" />
      <ControlRow keyName="Space" action="ジャンプ" />
      <Divider />
      <ControlRow keyName="左クリック" action="ブロック破壊 / 攻撃" />
      <ControlRow keyName="右クリック" action="ブロック設置" />
      <ControlRow keyName="R" action="ロケット発射" keyColor="#ff9966" />
      <ControlRow keyName="1-9" action="ホットバー選択" />
      <Divider />
      <ControlRow keyName="E" action="クラフト画面" />
      <ControlRow keyName="F" action="乗り物に乗る" keyColor="#88ccff" />
    </>
  );
}

/** ヘリコプター搭乗時の操作ガイド（座席別） */
function VehicleControls({ seat }: { seat: SeatType }) {
  const seatName = SEAT_NAMES[seat];
  const isPilot = seat === 'pilot';
  const isGunner = seat === 'gunner_left' || seat === 'gunner_right';

  return (
    <>
      {/* 現在の座席表示 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '2px',
      }}>
        <span style={{ fontSize: '12px' }}>🚁</span>
        <span style={{
          color: '#ffdd00',
          fontSize: '11px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
        }}>
          {seatName}
        </span>
      </div>
      <Divider />

      {/* パイロット操作 */}
      {isPilot && (
        <>
          <ControlRow keyName="W / S" action="前進 / 後退" keyColor="#50c878" />
          <ControlRow keyName="A / D" action="旋回" keyColor="#50c878" />
          <ControlRow keyName="Space" action="上昇" keyColor="#50c878" />
          <ControlRow keyName="Shift" action="下降" keyColor="#50c878" />
        </>
      )}

      {/* 機関銃手操作 */}
      {isGunner && (
        <>
          <ControlRow keyName="左クリック" action="射撃" keyColor="#ff6644" />
          <ControlRow keyName="マウス" action="照準" keyColor="#ff6644" />
        </>
      )}



      <Divider />

      {/* 共通操作 */}
      <ControlRow keyName="1-3" action="座席を移動" keyColor="#88ccff" />
      <ControlRow keyName="F" action="降りる" keyColor="#ff6644" />
    </>
  );
}

/** モバイル歩行操作ガイド */
function MobileWalkingControls() {
  return (
    <>
      <ControlRow keyName="🕹️" action="左スティックで移動" />
      <ControlRow keyName="👆" action="右エリアで視点操作" />
      <ControlRow keyName="タップ" action="ブロック破壊" />
      <ControlRow keyName="長押し" action="ブロック設置" />
      <ControlRow keyName="🚀" action="ロケット発射" />
    </>
  );
}

/** モバイルヘリ操作ガイド */
function MobileVehicleControls({ seat }: { seat: SeatType }) {
  const seatName = SEAT_NAMES[seat];
  const isPilot = seat === 'pilot';

  return (
    <>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '2px',
      }}>
        <span style={{ fontSize: '12px' }}>🚁</span>
        <span style={{
          color: '#ffdd00',
          fontSize: '11px',
          fontWeight: 'bold',
          fontFamily: 'monospace',
        }}>
          {seatName}
        </span>
      </div>
      <Divider />
      {isPilot && (
        <>
          <ControlRow keyName="🕹️" action="操縦" />
          <ControlRow keyName="⬆️" action="上昇ボタン" />
        </>
      )}
    </>
  );
}

export function ControlsGuide() {
  const mySeat = useVehicleStore((s) => s.helicopter.mySeat);
  const [visible, setVisible] = useState(true);
  const isTouch = isTouchDevice();

  // Hキーで表示/非表示トグル
  useEffect(() => {
    if (isTouch) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !e.repeat) {
        setVisible((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTouch]);

  if (!visible) return null;

  const isInVehicle = mySeat !== null;

  return (
    <div style={{
      position: 'fixed',
      bottom: isTouch ? 'calc(70px + env(safe-area-inset-bottom))' : '80px',
      right: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      background: 'rgba(0, 0, 0, 0.55)',
      borderRadius: '8px',
      padding: '8px 12px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(6px)',
      zIndex: 95,
      pointerEvents: 'none',
      maxWidth: '200px',
      transition: 'opacity 0.3s ease',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '2px',
      }}>
        <span style={{
          color: 'rgba(255, 255, 255, 0.35)',
          fontSize: '8px',
          fontFamily: 'monospace',
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
        }}>
          操作ガイド
        </span>
        {!isTouch && (
          <span style={{
            color: 'rgba(255, 255, 255, 0.2)',
            fontSize: '8px',
            fontFamily: 'monospace',
          }}>
            H: 非表示
          </span>
        )}
      </div>

      {/* コンテンツ */}
      {isTouch ? (
        isInVehicle ? (
          <MobileVehicleControls seat={mySeat} />
        ) : (
          <MobileWalkingControls />
        )
      ) : (
        isInVehicle ? (
          <VehicleControls seat={mySeat} />
        ) : (
          <WalkingControls />
        )
      )}
    </div>
  );
}
