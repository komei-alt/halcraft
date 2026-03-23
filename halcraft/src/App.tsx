// ハルクラ — メインアプリケーション
// Canvas + カスタム物理（Rapier不使用で軽量動作）
// デスクトップ＆モバイル両対応

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useState, useCallback } from 'react';
import { Player } from './components/Player';
import { World } from './components/World';
import { Environment } from './components/Environment';
import { BlockInteraction } from './components/BlockInteraction';
import { BlockBreakEffect } from './components/BlockBreakEffect';
import { DroppedItems } from './components/DroppedItems';
import { BlockLights } from './components/BlockLights';
import { TorchRenderer } from './components/TorchRenderer';
import { BedRenderer } from './components/BedRenderer';
import { MobManager } from './components/mobs/MobManager';
import { RemotePlayers } from './components/RemotePlayers';
import { Crosshair } from './components/ui/Crosshair';
import { Hotbar } from './components/ui/Hotbar';
import { HealthBar } from './components/ui/HealthBar';
import { DamageOverlay } from './components/ui/DamageOverlay';
import { TimeDisplay } from './components/ui/TimeDisplay';
import { StartScreen } from './components/ui/StartScreen';
import { CraftingScreen } from './components/ui/CraftingScreen';
import { VoiceChatUI } from './components/ui/VoiceChatUI';
import { MobileControls } from './components/ui/mobile/MobileControls';
import { useGameStore } from './stores/useGameStore';
import { isTouchDevice } from './utils/device';
import './App.css';

function GameCanvas() {
  const isTouch = isTouchDevice();

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{
        fov: isTouch ? 65 : 70,
        near: 0.1,
        far: isTouch ? 120 : 200,
      }}
      gl={{
        antialias: false,
        powerPreference: isTouch ? 'default' : 'high-performance',
      }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Environment />
        <World />
        <TorchRenderer />
        <BedRenderer />
        <BlockLights />
        <Player />
        <BlockInteraction />
        <BlockBreakEffect />
        <DroppedItems />
        <MobManager />
        <RemotePlayers />
      </Suspense>
    </Canvas>
  );
}

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const isTouch = isTouchDevice();

  // クラフト画面の開閉状態（モバイル用：外部から制御）
  const [craftingOpen, setCraftingOpen] = useState(false);

  const handleOpenCrafting = useCallback(() => {
    setCraftingOpen(true);
  }, []);

  const handleCloseCrafting = useCallback(() => {
    setCraftingOpen(false);
  }, []);

  return (
    <>
      <StartScreen />
      {phase !== 'menu' && (
        <>
          <GameCanvas />
          <Crosshair />
          <Hotbar />
          <HealthBar />
          <TimeDisplay />
          <DamageOverlay />
          <VoiceChatUI />
          <CraftingScreen
            externalOpen={isTouch ? craftingOpen : undefined}
            onClose={handleCloseCrafting}
          />
          {/* モバイルコントロール（タッチデバイスのみ） */}
          {isTouch && (
            <MobileControls onOpenCrafting={handleOpenCrafting} />
          )}
        </>
      )}
    </>
  );
}
