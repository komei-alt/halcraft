// ハルクラ — 開始画面とゲーム本体を分離したアプリケーション境界

import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import { StartScreen } from './components/ui/StartScreen';
import { MaintenanceOverlay } from './components/ui/MaintenanceOverlay';
import { SettingsButton, SettingsMenu } from './components/ui/SettingsMenu';
import { useGameStore } from './stores/useGameStore';
import { isTouchDevice } from './utils/device';
import { activateDesktopGameplayInput } from './utils/gameCanvas';
import './App.css';

const RIG_LAB_ENABLED = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('rigLab') === '1';
const RigLab = import.meta.env.DEV
  ? lazy(() => import('./components/mobs/RigLab'))
  : null;
const GameExperience = lazy(() => import('./components/GameExperience'));

function MainGameApp() {
  const phase = useGameStore((state) => state.phase);
  const togglePause = useGameStore((state) => state.togglePause);
  const isTouch = isTouchDevice();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const autoPausedForSettings = useRef(false);

  const handleOpenSettings = useCallback(() => {
    document.exitPointerLock?.();
    if (useGameStore.getState().phase === 'playing') {
      togglePause();
      autoPausedForSettings.current = true;
    }
    setSettingsOpen(true);
  }, [togglePause]);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    if (autoPausedForSettings.current && useGameStore.getState().phase === 'paused') togglePause();
    autoPausedForSettings.current = false;
    if (useGameStore.getState().phase === 'playing' && !isTouch) {
      window.setTimeout(() => activateDesktopGameplayInput(), 80);
    }
  }, [isTouch, togglePause]);

  return (
    <>
      <StartScreen />
      <MaintenanceOverlay />
      <SettingsButton
        variant={phase === 'menu' ? 'menu' : 'hud'}
        onClick={handleOpenSettings}
      />
      <SettingsMenu open={settingsOpen} onClose={handleCloseSettings} />
      {phase !== 'menu' && (
        <Suspense
          fallback={(
            <div
              className="game-canvas-shell game-canvas-loading"
              aria-label="ワールドを読み込み中"
            />
          )}
        >
          <GameExperience onOpenSettings={handleOpenSettings} />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  if (RIG_LAB_ENABLED && RigLab) {
    return (
      <Suspense fallback={<div className="rig-lab" />}>
        <RigLab />
      </Suspense>
    );
  }
  return <MainGameApp />;
}
