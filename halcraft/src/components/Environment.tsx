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

/** 色補間ヘルパー */
function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, t);
}

export function Environment() {
  const { scene } = useThree();
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  const advanceTime = useGameStore((s) => s.advanceTime);

  // 初期設定
  useEffect(() => {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 40, 80);
  }, [scene]);

  // 毎フレーム昼夜サイクルを更新
  useFrame((_, delta) => {
    // ゲーム時間を進める
    advanceTime(delta);

    const gameTime = useGameStore.getState().gameTime;

    // 時間帯に応じた環境を計算
    // 0.0=朝, 0.2=午前, 0.25=正午, 0.4=午後, 0.45=夕方, 0.5=日没, 0.75=深夜
    let skyColor: THREE.Color;
    let fogColor: THREE.Color;
    let sunIntensity: number;
    let ambientIntensity: number;
    let sunColor: THREE.Color;
    let sunPosition: THREE.Vector3;

    if (gameTime < 0.05) {
      // 夜明け (0.0 ~ 0.05)
      const t = gameTime / 0.05;
      skyColor = lerpColor(NIGHT_SKY, SUNSET_SKY, t);
      fogColor = lerpColor(NIGHT_FOG, SUNSET_FOG, t);
      sunIntensity = 0.3 + t * 0.8;
      ambientIntensity = 0.15 + t * 0.3;
      sunColor = lerpColor(NIGHT_SUN_COLOR, DAY_SUN_COLOR, t);
    } else if (gameTime < 0.1) {
      // 朝焼け→昼 (0.05 ~ 0.1)
      const t = (gameTime - 0.05) / 0.05;
      skyColor = lerpColor(SUNSET_SKY, DAY_SKY, t);
      fogColor = lerpColor(SUNSET_FOG, DAY_FOG, t);
      sunIntensity = 1.1 + t * 0.7;
      ambientIntensity = 0.45 + t * 0.15;
      sunColor = DAY_SUN_COLOR;
    } else if (gameTime < 0.4) {
      // 昼間 (0.1 ~ 0.4)
      skyColor = DAY_SKY;
      fogColor = DAY_FOG;
      sunIntensity = 1.8;
      ambientIntensity = 0.6;
      sunColor = DAY_SUN_COLOR;
    } else if (gameTime < 0.5) {
      // 夕暮れ (0.4 ~ 0.5)
      const t = (gameTime - 0.4) / 0.1;
      skyColor = lerpColor(DAY_SKY, SUNSET_SKY, t);
      fogColor = lerpColor(DAY_FOG, SUNSET_FOG, t);
      sunIntensity = 1.8 - t * 1.2;
      ambientIntensity = 0.6 - t * 0.35;
      sunColor = lerpColor(DAY_SUN_COLOR, SUNSET_SUN_COLOR, t);
    } else if (gameTime < 0.55) {
      // 日没 (0.5 ~ 0.55)
      const t = (gameTime - 0.5) / 0.05;
      skyColor = lerpColor(SUNSET_SKY, NIGHT_SKY, t);
      fogColor = lerpColor(SUNSET_FOG, NIGHT_FOG, t);
      sunIntensity = 0.6 - t * 0.4;
      ambientIntensity = 0.25 - t * 0.1;
      sunColor = lerpColor(SUNSET_SUN_COLOR, NIGHT_SUN_COLOR, t);
    } else {
      // 夜 (0.55 ~ 1.0)
      skyColor = NIGHT_SKY;
      fogColor = NIGHT_FOG;
      sunIntensity = 0.15;
      ambientIntensity = 0.12;
      sunColor = NIGHT_SUN_COLOR;
    }

    // 太陽の位置を時間に連動（円弧を描く）
    const sunAngle = gameTime * Math.PI * 2;
    sunPosition = new THREE.Vector3(
      Math.cos(sunAngle) * 60,
      Math.sin(sunAngle) * 80 + 10,
      30,
    );

    // シーンに適用
    (scene.background as THREE.Color).copy(skyColor);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogColor);
    }

    // ライト更新
    if (sunRef.current) {
      sunRef.current.position.copy(sunPosition);
      sunRef.current.intensity = sunIntensity;
      sunRef.current.color.copy(sunColor);
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
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
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
