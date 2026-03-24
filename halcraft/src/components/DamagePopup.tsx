// ダメージ数値ポップアップコンポーネント
// モブにダメージを与えた時、3D空間にダメージ数値が浮かんで消える
// BlockBreakEffectと同様のグローバルトリガーパターンを使用

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/** ダメージポップアップ1件 */
interface DamagePopupData {
  /** ダメージ量 */
  damage: number;
  /** ワールド座標 */
  x: number;
  y: number;
  z: number;
  /** 残存時間 */
  life: number;
  /** クリティカルか */
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

  // テキスト描画
  const text = `${damage}`;
  const fontSize = isCritical ? 48 : 32;
  ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // アウトライン（黒い縁取り）
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = isCritical ? 6 : 4;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, size / 2, size / 2);

  // 塗り
  ctx.fillStyle = isCritical ? '#FFD700' : '#FFFFFF';
  ctx.fillText(text, size / 2, size / 2);

  // クリティカル時は星マーク
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

export function DamagePopup() {
  const popupsRef = useRef<DamagePopupData[]>([]);
  const meshesRef = useRef<THREE.Group>(null);

  // テクスチャキャッシュ
  const textureCache = useRef(new Map<string, THREE.CanvasTexture>());

  // Spriteのプール
  const spritePool = useMemo(() => {
    const sprites: THREE.Sprite[] = [];
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
      sprites.push(sprite);
    }
    return sprites;
  }, []);

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
    for (let i = 0; i < spritePool.length; i++) {
      const sprite = spritePool[i];
      if (i < popups.length) {
        const popup = popups[i];

        // 上昇
        popup.y += RISE_SPEED * dt;

        // ランダムな横揺れ（初期のみ）
        const lifeRatio = popup.life / POPUP_LIFETIME;

        // 位置
        sprite.position.set(popup.x, popup.y, popup.z);

        // カメラの方を向く（billboard）— Spriteは自動的にbillboard

        // スケール（出現時にポップ + 消滅時に縮小）
        const popScale = lifeRatio > 0.7
          ? 1 + (1 - (lifeRatio - 0.7) / 0.3) * 0.3  // ポップ効果
          : lifeRatio < 0.3
          ? lifeRatio / 0.3  // 縮小
          : 1.0;
        const baseScale = popup.isCritical ? 1.2 : 0.7;
        sprite.scale.set(baseScale * popScale, baseScale * popScale, 1);

        // 透明度
        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity = Math.min(1, lifeRatio * 2);

        // テクスチャ設定（変更時のみ更新）
        const cacheKey = `${popup.damage}_${popup.isCritical}`;
        if (!textureCache.current.has(cacheKey)) {
          textureCache.current.set(cacheKey, createDamageTexture(popup.damage, popup.isCritical));
        }
        const newMap = textureCache.current.get(cacheKey)!;
        if (material.map !== newMap) {
          material.map = newMap;
          material.needsUpdate = true;
        }

        sprite.visible = true;
      } else {
        sprite.visible = false;
      }
    }
  });

  /** ダメージポップアップをスポーン */
  const spawnPopup = (damage: number, x: number, y: number, z: number, isCritical: boolean) => {
    const popups = popupsRef.current;
    // 上限チェック
    if (popups.length >= MAX_POPUPS) {
      popups.shift();
    }
    // 少しランダムにオフセット
    popups.push({
      damage,
      x: x + (Math.random() - 0.5) * 0.5,
      y: y + 1.5,
      z: z + (Math.random() - 0.5) * 0.5,
      life: POPUP_LIFETIME,
      isCritical,
    });
  };

  // グローバルアクセス
  DamagePopup.spawn = spawnPopup;

  return (
    <group ref={meshesRef}>
      {spritePool.map((sprite, i) => (
        <primitive key={i} object={sprite} />
      ))}
    </group>
  );
}

/** 外部からポップアップをトリガーするための静的メソッド */
DamagePopup.spawn = (_damage: number, _x: number, _y: number, _z: number, _isCritical: boolean) => {
  // 初期化前のフォールバック（何もしない）
};
