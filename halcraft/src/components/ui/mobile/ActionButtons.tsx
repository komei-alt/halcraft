// モバイルアクションボタン群
// 右側に配置：クラフト画面開閉、ブロック設置/破壊モード切替

import { useCallback } from 'react';
import { usePlayerStore } from '../../../stores/usePlayerStore';
import { useVehicleStore } from '../../../stores/useVehicleStore';
import { mobileActions, resetMobileActionTriggers } from '../../../utils/touchInput';

const BUTTON_SIZE = 48;

interface ActionButtonsProps {
  /** クラフト画面を開くコールバック */
  onOpenCrafting: () => void;
}

export function ActionButtons({ onOpenCrafting }: ActionButtonsProps) {
  const isPlaceMode = usePlayerStore((s) => s.isPlaceMode);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const cycleEquippedItem = usePlayerStore((s) => s.cycleEquippedItem);
  const togglePlaceMode = usePlayerStore((s) => s.togglePlaceMode);
  const activeVehicle = useVehicleStore((s) => s.activeVehicle);

  // 設置/破壊モード切替
  const handleTogglePlace = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlaceMode();
  }, [togglePlaceMode]);

  // クラフト画面開閉
  const handleCrafting = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenCrafting();
  }, [onOpenCrafting]);

  const handleWeaponSwitch = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resetMobileActionTriggers();
    cycleEquippedItem();
  }, [cycleEquippedItem]);

  // ロケット発射
  const handleRocket = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireRocket = true;
  }, []);

  const handleMachineGunStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireMachineGun = true;
  }, []);

  const handleMachineGunEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.fireMachineGun = false;
  }, []);

  const handleVehicleGunStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleGun = true;
  }, []);

  const handleVehicleGunEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleGun = false;
  }, []);

  const handleVehicleRocket = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleRocket = true;
  }, []);

  const handleVehicleBomb = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mobileActions.vehicleBomb = true;
  }, []);

  if (activeVehicle === 'tank' || activeVehicle === 'airplane') {
    return (
      <>
        <div
          onTouchStart={handleVehicleGunStart}
          onTouchEnd={handleVehicleGunEnd}
          onTouchCancel={handleVehicleGunEnd}
          style={{
            position: 'fixed',
            right: 20,
            bottom: `calc(${64 + 80}px + env(safe-area-inset-bottom))`,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: 8,
            background: 'rgba(255, 220, 100, 0.2)',
            border: '2px solid rgba(255, 230, 130, 0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 20,
            color: 'rgba(255, 245, 220, 0.85)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          🔫
        </div>
        {activeVehicle === 'tank' && (
          <div
            onTouchStart={handleVehicleRocket}
            style={{
              position: 'fixed',
              right: 20,
              bottom: `calc(${64 + 80 + BUTTON_SIZE + 12}px + env(safe-area-inset-bottom))`,
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              borderRadius: 8,
              background: 'rgba(255, 130, 70, 0.22)',
              border: '2px solid rgba(255, 170, 110, 0.42)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 120,
              touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
              fontSize: 20,
              color: 'rgba(255, 245, 220, 0.85)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            💥
          </div>
        )}
        {activeVehicle === 'airplane' && (
          <div
            onTouchStart={handleVehicleBomb}
            style={{
              position: 'fixed',
              right: 20,
              bottom: `calc(${64 + 80 + BUTTON_SIZE + 12}px + env(safe-area-inset-bottom))`,
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              borderRadius: 8,
              background: 'rgba(255, 80, 50, 0.25)',
              border: '2px solid rgba(255, 120, 80, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 120,
              touchAction: 'none',
              WebkitTapHighlightColor: 'transparent',
              fontSize: 20,
              color: 'rgba(255, 245, 220, 0.85)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            💣
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* 武器切り替え */}
      <div
        onTouchStart={handleWeaponSwitch}
        style={{
          position: 'fixed',
          right: 20,
          bottom: `calc(${64 + 80 + (BUTTON_SIZE + 12) * 2}px + env(safe-area-inset-bottom))`,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: 8,
          background: equippedItem === 'rocket_launcher'
            ? 'rgba(255, 150, 80, 0.22)'
            : 'rgba(120, 180, 255, 0.18)',
          border: equippedItem === 'rocket_launcher'
            ? '2px solid rgba(255, 170, 110, 0.4)'
            : equippedItem === 'machine_gun'
              ? '2px solid rgba(255, 220, 120, 0.4)'
            : '2px solid rgba(170, 215, 255, 0.34)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
          fontSize: 20,
          color: 'rgba(255, 245, 220, 0.85)',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {equippedItem === 'rocket_launcher' ? '🚀' : equippedItem === 'machine_gun' ? '🔫' : '⛏️'}
      </div>

      {equippedItem === 'rocket_launcher' ? (
        <div
          onTouchStart={handleRocket}
          style={{
            position: 'fixed',
            right: 20,
            bottom: `calc(${64 + 80}px + env(safe-area-inset-bottom))`,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: 8,
            background: 'rgba(255, 150, 80, 0.2)',
            border: '2px solid rgba(255, 170, 110, 0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 20,
            color: 'rgba(255, 245, 220, 0.85)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          💥
        </div>
      ) : equippedItem === 'machine_gun' ? (
        <div
          onTouchStart={handleMachineGunStart}
          onTouchEnd={handleMachineGunEnd}
          onTouchCancel={handleMachineGunEnd}
          style={{
            position: 'fixed',
            right: 20,
            bottom: `calc(${64 + 80}px + env(safe-area-inset-bottom))`,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: 8,
            background: 'rgba(255, 220, 100, 0.2)',
            border: '2px solid rgba(255, 230, 130, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 20,
            color: 'rgba(255, 245, 220, 0.85)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          🔫
        </div>
      ) : (
        <div
          onTouchStart={handleTogglePlace}
          style={{
            position: 'fixed',
            right: 20,
            bottom: `calc(${64 + 80}px + env(safe-area-inset-bottom))`,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: 8,
            background: isPlaceMode
              ? 'rgba(100, 200, 100, 0.2)'
              : 'rgba(255, 100, 100, 0.2)',
            border: `2px solid ${
              isPlaceMode ? 'rgba(100, 200, 100, 0.4)' : 'rgba(255, 100, 100, 0.4)'
            }`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            touchAction: 'none',
            WebkitTapHighlightColor: 'transparent',
            fontSize: 20,
            color: 'rgba(255, 255, 255, 0.7)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          {isPlaceMode ? '🧱' : '⛏️'}
        </div>
      )}

      {/* クラフト画面ボタン */}
      <div
        onTouchStart={handleCrafting}
        style={{
          position: 'fixed',
          right: 20,
          bottom: `calc(${64 + 80 + BUTTON_SIZE + 12}px + env(safe-area-inset-bottom))`,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.08)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          touchAction: 'none',
          WebkitTapHighlightColor: 'transparent',
          fontSize: 20,
          color: 'rgba(255, 255, 255, 0.7)',
          textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        🔧
      </div>
    </>
  );
}
