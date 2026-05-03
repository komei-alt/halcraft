// 環境コンポーネント
// 昼夜サイクルに基づく空の色、太陽光、霧を管理
// バイオーム設定から環境色を取得

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { BIOME_CONFIGS } from '../types/biomes';

/** 再利用用オブジェクト（GCプレッシャー削減） */
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _sunPosition = new THREE.Vector3();

/** バイオーム色キャッシュ用 */
const _daySky = new THREE.Color();
const _dayFog = new THREE.Color();
const _daySun = new THREE.Color();
const _nightSky = new THREE.Color();
const _nightFog = new THREE.Color();
const _nightSun = new THREE.Color();
const _sunsetSky = new THREE.Color();
const _sunsetFog = new THREE.Color();
const _sunsetSun = new THREE.Color();

/** 現在のバイオーム色をキャッシュ */
let cachedBiomeId: string | null = null;
let cachedFogNear = 100;
let cachedFogFar = 250;

function updateBiomeColors(biomeId: string): void {
  if (biomeId === cachedBiomeId) return;
  cachedBiomeId = biomeId;

  const biome = BIOME_CONFIGS[biomeId as keyof typeof BIOME_CONFIGS];
  if (!biome) return;

  _daySky.setHex(biome.daySkyColor);
  _dayFog.setHex(biome.dayFogColor);
  _daySun.setHex(biome.daySunColor);
  _nightSky.setHex(biome.nightSkyColor);
  _nightFog.setHex(biome.nightFogColor);
  _nightSun.setHex(biome.nightSunColor);
  _sunsetSky.setHex(biome.sunsetSkyColor);
  _sunsetFog.setHex(biome.sunsetFogColor);
  _sunsetSun.setHex(biome.sunsetSunColor);
  cachedFogNear = biome.fogNear;
  cachedFogFar = biome.fogFar;
}

export function Environment() {
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  const advanceTime = useGameStore((s) => s.advanceTime);

  // scene の初期設定（マウント時に一度だけ実行）
  // scene は R3F が管理する外部オブジェクトであり、副作用として初期化する必要がある
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 250);
  }, [scene]);
  /* eslint-enable react-hooks/immutability */

  // 毎フレーム昼夜サイクルを更新
  useFrame((_, delta) => {
    // ゲーム時間を進める
    advanceTime(delta);

    const gameState = useGameStore.getState();
    const gameTime = gameState.gameTime;

    // バイオーム色を更新
    const biomeId = gameState.currentBiome?.id ?? 'forest';
    updateBiomeColors(biomeId);

    // 霧距離をバイオームに合わせる
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = cachedFogNear;
      scene.fog.far = cachedFogFar;
    }

    // 時間帯に応じた環境を計算（再利用オブジェクトで0アロケーション）
    let sunIntensity: number;
    let ambientIntensity: number;

    if (gameTime < 0.05) {
      const t = gameTime / 0.05;
      _skyColor.copy(_nightSky).lerp(_sunsetSky, t);
      _fogColor.copy(_nightFog).lerp(_sunsetFog, t);
      sunIntensity = 0.3 + t * 0.8;
      ambientIntensity = 0.15 + t * 0.3;
      _sunColor.copy(_nightSun).lerp(_daySun, t);
    } else if (gameTime < 0.1) {
      const t = (gameTime - 0.05) / 0.05;
      _skyColor.copy(_sunsetSky).lerp(_daySky, t);
      _fogColor.copy(_sunsetFog).lerp(_dayFog, t);
      sunIntensity = 1.1 + t * 0.7;
      ambientIntensity = 0.45 + t * 0.15;
      _sunColor.copy(_daySun);
    } else if (gameTime < 0.4) {
      _skyColor.copy(_daySky);
      _fogColor.copy(_dayFog);
      sunIntensity = 1.8;
      ambientIntensity = 0.6;
      _sunColor.copy(_daySun);
    } else if (gameTime < 0.5) {
      const t = (gameTime - 0.4) / 0.1;
      _skyColor.copy(_daySky).lerp(_sunsetSky, t);
      _fogColor.copy(_dayFog).lerp(_sunsetFog, t);
      sunIntensity = 1.8 - t * 1.2;
      ambientIntensity = 0.6 - t * 0.35;
      _sunColor.copy(_daySun).lerp(_sunsetSun, t);
    } else if (gameTime < 0.55) {
      const t = (gameTime - 0.5) / 0.05;
      _skyColor.copy(_sunsetSky).lerp(_nightSky, t);
      _fogColor.copy(_sunsetFog).lerp(_nightFog, t);
      sunIntensity = 0.6 - t * 0.25;
      ambientIntensity = 0.25 - t * 0.03;
      _sunColor.copy(_sunsetSun).lerp(_nightSun, t);
    } else {
      _skyColor.copy(_nightSky);
      _fogColor.copy(_nightFog);
      sunIntensity = 0.35;
      ambientIntensity = 0.22;
      _sunColor.copy(_nightSun);
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
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-near={0.5}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
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
