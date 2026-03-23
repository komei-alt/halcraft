// ============================================
// NameTag — プレイヤー頭上の名前表示
// Canvas テクスチャ + Sprite で Billboard 表示
// 発話中はグリーンのインジケーター表示
// ============================================

import { useMemo } from 'react';
import * as THREE from 'three';

interface NameTagProps {
  name: string;
  /** ボイスチャットで発話中か */
  speaking?: boolean;
}

/**
 * Canvasテクスチャで名前タグを生成し、Spriteとして表示。
 * 常にカメラを向くBillboard動作。
 * 発話中はグリーンの枠・アイコンで視覚的にフィードバック。
 */
export function NameTag({ name, speaking = false }: NameTagProps) {
  const { texture, aspectRatio } = useMemo(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    // 背景（角丸矩形）
    if (speaking) {
      // 発話中: グリーンの枠付き
      ctx.fillStyle = 'rgba(46, 204, 113, 0.25)';
      roundRect(ctx, 2, 10, canvas.width - 4, canvas.height - 20, 10);
      ctx.fill();

      ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
      ctx.lineWidth = 2;
      roundRect(ctx, 2, 10, canvas.width - 4, canvas.height - 20, 10);
      ctx.stroke();
    } else {
      // 通常: 半透明黒背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      roundRect(ctx, 4, 12, canvas.width - 8, canvas.height - 24, 8);
      ctx.fill();
    }

    // 名前テキスト
    ctx.font = 'bold 22px "Segoe UI", "Hiragino Sans", system-ui, sans-serif';
    ctx.fillStyle = speaking ? '#2ecc71' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 発話中は🎙️アイコン付き
    const displayText = speaking ? `🎙️ ${name}` : name;
    ctx.fillText(displayText, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    return {
      texture: tex,
      aspectRatio: canvas.width / canvas.height,
    };
  }, [name, speaking]);

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
