// ============================================
// NameTag — プレイヤー頭上の名前表示
// Canvas テクスチャ + Sprite で Billboard 表示
// ============================================

import { useMemo } from 'react';
import * as THREE from 'three';

interface NameTagProps {
  name: string;
}

/**
 * Canvasテクスチャで名前タグを生成し、Spriteとして表示。
 * 常にカメラを向くBillboard動作。
 */
export function NameTag({ name }: NameTagProps) {
  const { texture, aspectRatio } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // 背景（角丸矩形）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    roundRect(ctx, 4, 12, canvas.width - 8, canvas.height - 24, 8);
    ctx.fill();

    // テキスト
    ctx.font = 'bold 22px "Segoe UI", "Hiragino Sans", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    return {
      texture: tex,
      aspectRatio: canvas.width / canvas.height,
    };
  }, [name]);

  const spriteMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    [texture],
  );

  // 頭上 0.5 ブロック上に表示
  const scale = 1.6;
  return (
    <sprite
      material={spriteMat}
      position={[0, 2.2, 0]}
      scale={[scale * aspectRatio, scale, 1]}
    />
  );
}

/** 角丸矩形の描画ヘルパー */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
