// ハルクラ — メインアプリケーション
// Canvas + カスタム物理（Rapier不使用で軽量動作）

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Player } from './components/Player';
import { World } from './components/World';
import { Environment } from './components/Environment';
import { BlockInteraction } from './components/BlockInteraction';
import { MobManager } from './components/mobs/MobManager';
import { Crosshair } from './components/ui/Crosshair';
import { Hotbar } from './components/ui/Hotbar';
import { HealthBar } from './components/ui/HealthBar';
import { DamageOverlay } from './components/ui/DamageOverlay';
import { TimeDisplay } from './components/ui/TimeDisplay';
import { StartScreen } from './components/ui/StartScreen';
import { CraftingScreen } from './components/ui/CraftingScreen';
import { useGameStore } from './stores/useGameStore';
import './App.css';

function GameCanvas() {
  return (
    <Canvas
      shadows
      camera={{ fov: 70, near: 0.1, far: 200 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Environment />
        <World />
        <Player />
        <BlockInteraction />
        <MobManager />
      </Suspense>
    </Canvas>
  );
}

export default function App() {
  const phase = useGameStore((s) => s.phase);

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
          <CraftingScreen />
        </>
      )}
    </>
  );
}
