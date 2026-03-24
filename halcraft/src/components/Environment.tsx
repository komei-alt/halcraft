// 環境コンポーネント
// 昼夜サイクルに基づく空の色、太陽光、霧を管理

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';

/** 昼の色定義 */
const DAY_SKY = new THREE.Color(0x87ceeb);
const DAY_FOG = new THREE.Color(0x87ceeb);
const DAY_SUN_COLOR = new THREE.Color(0xfff5e0);

/** 夜の色定義 */
const NIGHT_SKY = new THREE.Color(0x0a0a20);
const NIGHT_FOG = new THREE.Color(0x0a0a20);
const NIGHT_SUN_COLOR = new THREE.Color(0x334488);

/** 夕焼けの色 */
const SUNSET_SKY = new THREE.Color(0xff7733);
const SUNSET_FOG = new THREE.Color(0xff6622);
const SUNSET_SUN_COLOR = new THREE.Color(0xff6622);

/** 再利用用オブジェクト（GCプレッシャー削減） */
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _sunPosition = new THREE.Vector3();

export function Environment() {
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  const advanceTime = useGameStore((s) => s.advanceTime);

  // 初期設定
  useEffect(() => {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 60, 130);
  }, [scene]);

  // 毎フレーム昼夜サイクルを更新
  useFrame((_, delta) => {
    // ゲーム時間を進める
    advanceTime(delta);

    const gameTime = useGameStore.getState().gameTime;

    // 時間帯に応じた環境を計算（再利用オブジェクトで0アロケーション）
    let sunIntensity: number;
    let ambientIntensity: number;

    if (gameTime < 0.05) {
      const t = gameTime / 0.05;
      _skyColor.copy(NIGHT_SKY).lerp(SUNSET_SKY, t);
      _fogColor.copy(NIGHT_FOG).lerp(SUNSET_FOG, t);
      sunIntensity = 0.3 + t * 0.8;
      ambientIntensity = 0.15 + t * 0.3;
      _sunColor.copy(NIGHT_SUN_COLOR).lerp(DAY_SUN_COLOR, t);
    } else if (gameTime < 0.1) {
      const t = (gameTime - 0.05) / 0.05;
      _skyColor.copy(SUNSET_SKY).lerp(DAY_SKY, t);
      _fogColor.copy(SUNSET_FOG).lerp(DAY_FOG, t);
      sunIntensity = 1.1 + t * 0.7;
      ambientIntensity = 0.45 + t * 0.15;
      _sunColor.copy(DAY_SUN_COLOR);
    } else if (gameTime < 0.4) {
      _skyColor.copy(DAY_SKY);
      _fogColor.copy(DAY_FOG);
      sunIntensity = 1.8;
      ambientIntensity = 0.6;
      _sunColor.copy(DAY_SUN_COLOR);
    } else if (gameTime < 0.5) {
      const t = (gameTime - 0.4) / 0.1;
      _skyColor.copy(DAY_SKY).lerp(SUNSET_SKY, t);
      _fogColor.copy(DAY_FOG).lerp(SUNSET_FOG, t);
      sunIntensity = 1.8 - t * 1.2;
      ambientIntensity = 0.6 - t * 0.35;
      _sunColor.copy(DAY_SUN_COLOR).lerp(SUNSET_SUN_COLOR, t);
    } else if (gameTime < 0.55) {
      const t = (gameTime - 0.5) / 0.05;
      _skyColor.copy(SUNSET_SKY).lerp(NIGHT_SKY, t);
      _fogColor.copy(SUNSET_FOG).lerp(NIGHT_FOG, t);
      sunIntensity = 0.6 - t * 0.4;
      ambientIntensity = 0.25 - t * 0.1;
      _sunColor.copy(SUNSET_SUN_COLOR).lerp(NIGHT_SUN_COLOR, t);
    } else {
      _skyColor.copy(NIGHT_SKY);
      _fogColor.copy(NIGHT_FOG);
      sunIntensity = 0.15;
      ambientIntensity = 0.12;
      _sunColor.copy(NIGHT_SUN_COLOR);
    }

    // 太陽の位置を時間に連動（円弧を描く）
    const sunAngle = gameTime * Math.PI * 2;
    _sunPosition.set(
      Math.cos(sunAngle) * 60,
      Math.sin(sunAngle) * 80 + 10,
      30,
    );

    // シーンに適用
    (scene.background as THREE.Color).copy(_skyColor);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_fogColor);
    }

    // ライト更新
    if (sunRef.current) {
      sunRef.current.position.copy(_sunPosition);
      sunRef.current.intensity = sunIntensity;
      sunRef.current.color.copy(_sunColor);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = ambientIntensity;
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = Math.max(0.1, ambientIntensity * 0.7);
    }
  });

  return (
    <>
      {/* 環境光（全体を柔らかく照らす） */}
      <ambientLight ref={ambientRef} intensity={0.6} color={0xffffff} />

      {/* 太陽光（影を落とす主光源） */}
      <directionalLight
        ref={sunRef}
        position={[50, 80, 30]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={120}
        shadow-camera-near={0.5}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        color={0xfff5e0}
      />

      {/* 半球ライト（空の色→地面の色の2色で自然な環境光） */}
      <hemisphereLight
        ref={hemiRef}
        args={[0x87ceeb, 0x6b8e23, 0.4]}
      />
    </>
  );
}
