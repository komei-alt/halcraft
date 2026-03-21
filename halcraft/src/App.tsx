import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PointerLockControls, Loader } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { World } from './components/World';
import { Player } from './components/Player';
import { Environment } from './components/Environment';
import { Companion } from './components/Companion';

export default function App() {
  return (
    <>
      <div className="crosshair">+</div>
      <Canvas shadows camera={{ fov: 60 }}>
        {/* 環境光と発光ライト */}
        <ambientLight intensity={1.5} />
        <pointLight position={[100, 100, 100]} intensity={1} castShadow />
        
        <Suspense fallback={null}>
          {/* Rapier 物理エンジン起動（重力をより強くしてフワフワ感を除去） */}
          <Physics gravity={[0, -50, 0]}>
            <Environment />
            <World />
            {/* 味方キャラクターをスタート地点の目の前に配置！ */}
            <Companion position={[0, 1.1, -5]} />
            <Player />
          </Physics>
        </Suspense>
        
        {/* 初回クリックで画面にポインターをロック（FPS操作の基本） */}
        <PointerLockControls />
      </Canvas>
      
      {/* 素材のロード画面自動表示 */}
      <Loader />
    </>
  );
}

