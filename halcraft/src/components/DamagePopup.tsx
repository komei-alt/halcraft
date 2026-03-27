// ダメージ数値ポップアップコンポーネント
// モブにダメージを与えた時、3D空間にダメージ数値が浮かんで消える

import { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerDamagePopupSpawner } from '../utils/effectTriggers';

/** ダメージポップアップ1件 */
interface DamagePopupData {
  damage: number;
  x: number;
  y: number;
  z: number;
  life: number;
  isCritical: boolean;
}

/** ポップアップの表示時間（秒） */
const POPUP_LIFETIME = 0.8;
/** 上昇速度 */
const RISE_SPEED = 2.5;
/** 同時に表示可能な最大数 */
const MAX_POPUPS = 16;

// ポップアップ用テクスチャをキャンバスで生成
function createDamageTexture(damage: number, isCritical: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = isCritical ? 128 : 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const text = `${damage}`;
  const fontSize = isCritical ? 48 : 32;
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = isCritical ? 6 : 4;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, size / 2, size / 2);

  ctx.fillStyle = isCritical ? '#FFD700' : '#FFFFFF';
  ctx.fillText(text, size / 2, size / 2);

  if (isCritical) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText('✦', size / 2 - 20, size / 2 - 20);
    ctx.fillText('✦', size / 2 + 20, size / 2 - 15);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// モジュールレベルでSpriteプールを生成（コンポーネントのレンダリングとは独立）
const SPRITE_POOL: THREE.Sprite[] = [];
for (let i = 0; i < MAX_POPUPS; i++) {
  const material = new THREE.SpriteMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.renderOrder = 999;
  SPRITE_POOL.push(sprite);
}

export function DamagePopup() {
  const popupsRef = useRef<DamagePopupData[]>([]);
  const meshesRef = useRef<THREE.Group>(null);
  const textureCache = useRef(new Map<string, THREE.CanvasTexture>());

  // スポーン関数を useCallback で安定化
  const spawnPopup = useCallback((damage: number, x: number, y: number, z: number, isCritical: boolean) => {
    const popups = popupsRef.current;
    if (popups.length >= MAX_POPUPS) {
      popups.shift();
    }
    popups.push({
      damage,
      x: x + (Math.random() - 0.5) * 0.5,
      y: y + 1.5,
      z: z + (Math.random() - 0.5) * 0.5,
      life: POPUP_LIFETIME,
      isCritical,
    });
  }, []);

  // グローバルトリガーに登録
  useEffect(() => {
    registerDamagePopupSpawner(spawnPopup);
    return () => registerDamagePopupSpawner(() => {});
  }, [spawnPopup]);

  // 毎フレーム更新
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const popups = popupsRef.current;

    // 期限切れを削除
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].life -= dt;
      if (popups[i].life <= 0) {
        popups.splice(i, 1);
      }
    }

    // スプライトを更新
    for (let i = 0; i < SPRITE_POOL.length; i++) {
      const sprite = SPRITE_POOL[i];
      if (i < popups.length) {
        const popup = popups[i];
        popup.y += RISE_SPEED * dt;
        const lifeRatio = popup.life / POPUP_LIFETIME;

        sprite.position.set(popup.x, popup.y, popup.z);

        const popScale = lifeRatio > 0.7
          ? 1 + (1 - (lifeRatio - 0.7) / 0.3) * 0.3
          : lifeRatio < 0.3
          ? lifeRatio / 0.3
          : 1.0;
        const baseScale = popup.isCritical ? 1.2 : 0.7;
        sprite.scale.set(baseScale * popScale, baseScale * popScale, 1);

        const mat = sprite.material as THREE.SpriteMaterial;
        mat.opacity = Math.min(1, lifeRatio * 2);

        const cacheKey = `${popup.damage}_${popup.isCritical}`;
        if (!textureCache.current.has(cacheKey)) {
          textureCache.current.set(cacheKey, createDamageTexture(popup.damage, popup.isCritical));
        }
        const newMap = textureCache.current.get(cacheKey)!;
        if (mat.map !== newMap) {
          mat.map = newMap;
          mat.needsUpdate = true;
        }

        sprite.visible = true;
      } else {
        sprite.visible = false;
      }
    }
  });

  return (
    <group ref={meshesRef}>
      {SPRITE_POOL.map((sprite, i) => (
        <primitive key={i} object={sprite} />
      ))}
    </group>
  );
}
