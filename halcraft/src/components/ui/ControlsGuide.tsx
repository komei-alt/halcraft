// 操作ガイドUI
// 歩行時・乗り物搭乗時で異なる操作方法を表示
// 右下に常時表示（コンパクトなデザインで邪魔にならない）
// Hキーで表示/非表示を切り替え可能

import { useState, useEffect } from 'react';
import { useVehicleStore, CAR_SEAT_NAMES, SEAT_NAMES, VEHICLE_NAMES } from '../../stores/useVehicleStore';
import type { CarSeatType, SeatType, VehicleType } from '../../stores/useVehicleStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useGameStore } from '../../stores/useGameStore';
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
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const gameMode = useGameStore((s) => s.gameMode);
  const creativeFlying = useGameStore((s) => s.creativeFlying);
  const isCreative = gameMode === 'creative';

  return (
    <>
      <ControlRow keyName="W A S D" action="移動" />
      <ControlRow keyName="Ctrl / Q / WW" action="ダッシュ" />
      {creativeFlying ? (
        <>
          <ControlRow keyName="Space" action="上昇" keyColor="#88ccff" />
          <ControlRow keyName="Shift" action="下降" keyColor="#88ccff" />
          <ControlRow keyName="Space×2" action="飛行オフ" keyColor="#88ccff" />
        </>
      ) : (
        <>
          <ControlRow keyName="Space" action="ジャンプ" />
          {isCreative && <ControlRow keyName="Space×2" action="飛行オン" keyColor="#88ccff" />}
        </>
      )}
      <Divider />
      {equippedItem === 'builder' ? (
        <>
          <ControlRow keyName="左クリック" action="ブロック破壊 / 攻撃" />
          <ControlRow keyName="右クリック" action="ブロック設置" />
        </>
      ) : equippedItem === 'rocket_launcher' ? (
        <>
          <ControlRow keyName="左クリック / R" action="ロケット発射" keyColor="#ff9966" />
          <ControlRow keyName="大ばくはつ" action="広いはんいにダメージ" keyColor="#ff9966" />
        </>
      ) : (
        <>
          <ControlRow keyName="左クリック長押し" action="機関銃を連射" keyColor="#ffe28a" />
          <ControlRow keyName="右クリック長押し" action="スコープでねらう" keyColor="#ffe28a" />
        </>
      )}
      <ControlRow keyName="V" action="武器切り替え" keyColor="#ffd56d" />
      <ControlRow keyName="1-9" action="ホットバー選択" />
      <Divider />
      <ControlRow keyName="E" action="クラフト画面" />
      <ControlRow keyName="F" action="乗り物に乗る" keyColor="#88ccff" />
    </>
  );
}

/** 乗り物搭乗時の操作ガイド */
function VehicleControls({ vehicle, seat }: { vehicle: VehicleType; seat: SeatType | 'pilot' | CarSeatType }) {
  if (vehicle === 'tank') {
    return (
      <>
        <VehicleHeader icon="🛞" label={VEHICLE_NAMES.tank} />
        <Divider />
        <ControlRow keyName="W / S" action="前進 / 後退" keyColor="#50c878" />
        <ControlRow keyName="A / D" action="旋回" keyColor="#50c878" />
        <ControlRow keyName="マウス" action="砲塔を回す" keyColor="#ffdd66" />
        <ControlRow keyName="左クリック" action="ガトリング" keyColor="#ff6644" />
        <ControlRow keyName="右クリック" action="主砲ロケット" keyColor="#ff9966" />
        <Divider />
        <ControlRow keyName="F" action="降りる" keyColor="#ff6644" />
      </>
    );
  }

  if (vehicle === 'airplane') {
    return (
      <>
        <VehicleHeader icon="✈️" label={VEHICLE_NAMES.airplane} />
        <Divider />
        <ControlRow keyName="W / S" action="加速 / 減速" keyColor="#50c878" />
        <ControlRow keyName="マウス" action="機首 / 旋回" keyColor="#ffdd66" />
        <ControlRow keyName="A / D" action="旋回補助" keyColor="#50c878" />
        <ControlRow keyName="Space" action="機首上げ補助" keyColor="#88ccff" />
        <ControlRow keyName="Shift" action="機首下げ" keyColor="#88ccff" />
        <ControlRow keyName="左クリック" action="ガトリング" keyColor="#ff6644" />
        <Divider />
        <ControlRow keyName="F" action="降りる" keyColor="#ff6644" />
      </>
    );
  }

  if (vehicle === 'car') {
    const carSeatName = CAR_SEAT_NAMES[seat as CarSeatType];
    const isDriver = seat === 'driver';
    return (
      <>
        <VehicleHeader icon="🚗" label={carSeatName} />
        <Divider />
        {isDriver ? (
          <>
            <ControlRow keyName="W / S" action="前進 / 後退" keyColor="#50c878" />
            <ControlRow keyName="A / D" action="ハンドル" keyColor="#50c878" />
            <ControlRow keyName="マウス" action="視点" keyColor="#ffdd66" />
          </>
        ) : (
          <ControlRow keyName="マウス" action="車内から見回す" keyColor="#ffdd66" />
        )}
        <Divider />
        <ControlRow keyName="F" action="降りる" keyColor="#ff6644" />
      </>
    );
  }

  const seatName = SEAT_NAMES[seat as SeatType];
  const isPilot = seat === 'pilot';
  const isGunner = seat === 'gunner_left' || seat === 'gunner_right';

  return (
    <>
      {/* 現在の座席表示 */}
      <VehicleHeader icon="🚁" label={seatName} />
      <Divider />

      {/* パイロット操作 */}
      {isPilot && (
        <>
          <ControlRow keyName="W / S" action="前進 / 後退" keyColor="#50c878" />
          <ControlRow keyName="マウス" action="傾けて旋回" keyColor="#ffdd66" />
          <ControlRow keyName="A / D" action="旋回補助" keyColor="#50c878" />
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

function VehicleHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginBottom: '2px',
    }}>
      <span style={{ fontSize: '12px' }}>{icon}</span>
      <span style={{
        color: '#ffdd00',
        fontSize: '11px',
        fontWeight: 'bold',
        fontFamily: 'monospace',
      }}>
        {label}
      </span>
    </div>
  );
}

/** モバイル歩行操作ガイド */
function MobileWalkingControls() {
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const gameMode = useGameStore((s) => s.gameMode);
  const creativeFlying = useGameStore((s) => s.creativeFlying);
  const isCreative = gameMode === 'creative';

  return (
    <>
      <ControlRow keyName="🕹️" action="左スティックで移動" />
      <ControlRow keyName="👆" action="右エリアで視点操作" />
      {creativeFlying ? (
        <>
          <ControlRow keyName="▲" action="上昇" keyColor="#88ccff" />
          <ControlRow keyName="▼" action="下降" keyColor="#88ccff" />
          <ControlRow keyName="▲×2" action="飛行オフ" keyColor="#88ccff" />
        </>
      ) : (
        <>
          <ControlRow keyName="▲" action="ジャンプ" />
          {isCreative && <ControlRow keyName="▲×2" action="飛行オン" keyColor="#88ccff" />}
        </>
      )}
      {equippedItem === 'builder' ? (
        <>
          <ControlRow keyName="タップ" action="ブロック破壊" />
          <ControlRow keyName="長押し" action="ブロック設置" />
        </>
      ) : equippedItem === 'rocket_launcher' ? (
        <ControlRow keyName="🚀" action="ロケット発射" />
      ) : (
        <ControlRow keyName="🔫" action="機関銃を連射" />
      )}
      <ControlRow keyName="🔁" action="武器切り替え" />
    </>
  );
}

/** モバイル乗り物操作ガイド */
function MobileVehicleControls({ vehicle, seat }: { vehicle: VehicleType; seat: SeatType | 'pilot' | CarSeatType }) {
  if (vehicle === 'tank' || vehicle === 'airplane') {
    return (
      <>
        <VehicleHeader icon={vehicle === 'tank' ? '🛞' : '✈️'} label={VEHICLE_NAMES[vehicle]} />
        <Divider />
        <ControlRow keyName="🕹️" action={vehicle === 'tank' ? '走行' : '操縦'} />
        <ControlRow keyName="⬆️" action={vehicle === 'airplane' ? '離陸補助' : 'ジャンプボタン'} />
        <ControlRow keyName="🔫" action="ガトリング" keyColor="#ff6644" />
        {vehicle === 'tank' && <ControlRow keyName="💥" action="主砲ロケット" keyColor="#ff9966" />}
      </>
    );
  }

  if (vehicle === 'car') {
    return (
      <>
        <VehicleHeader icon="🚗" label={CAR_SEAT_NAMES[seat as CarSeatType]} />
        <Divider />
        {seat === 'driver' ? (
          <ControlRow keyName="🕹️" action="運転" />
        ) : (
          <ControlRow keyName="👀" action="見回す" />
        )}
      </>
    );
  }

  const seatName = SEAT_NAMES[seat as SeatType];
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
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);
  const helicopterSeat = useVehicleStore((s) => s.helicopter.mySeat);
  const tankSeat = useVehicleStore((s) => s.tank.mySeat);
  const airplaneSeat = useVehicleStore((s) => s.airplane.mySeat);
  const carSeat = useVehicleStore((s) => s.car.mySeat);
  const isTouch = isTouchDevice();
  const [visible, setVisible] = useState(() => !isTouch);

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

  const mySeat = activeVehicle === 'helicopter'
    ? helicopterSeat
    : activeVehicle === 'tank'
      ? tankSeat
      : activeVehicle === 'airplane'
        ? airplaneSeat
        : activeVehicle === 'car'
          ? carSeat
          : null;
  const isInVehicle = activeVehicle !== null && mySeat !== null;

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
          <MobileVehicleControls vehicle={activeVehicle} seat={mySeat} />
        ) : (
          <MobileWalkingControls />
        )
      ) : (
        isInVehicle ? (
          <VehicleControls vehicle={activeVehicle} seat={mySeat} />
        ) : (
          <WalkingControls />
        )
      )}
    </div>
  );
}
