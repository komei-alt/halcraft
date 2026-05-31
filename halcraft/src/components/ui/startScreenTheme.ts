// スタート画面のデザイントークン（コンシューマー級UIの統一基盤）
// index.css の :root 変数と対になる JS 側の値。
// インラインスタイルで色計算やグラデーションが必要な箇所はこちらを使う。
// 単純な参照は 'var(--sg-*)' を直接書いてもよい。

import type { CSSProperties } from 'react';

/** カラートークン */
export const SG = {
  build: '#58b7ff',
  war: '#ff6c4f',
  emerald: '#6fe6a8',
  gold: '#ffd56a',
  text: '#f3f7fc',
  textDim: 'rgba(238,244,252,0.66)',
  textFaint: 'rgba(238,244,252,0.42)',
  line: 'rgba(255,255,255,0.14)',
  lineStrong: 'rgba(255,255,255,0.22)',
  surface0: 'rgba(11,15,23,0.74)',
  surface1: 'rgba(20,27,38,0.62)',
  surface2: 'rgba(255,255,255,0.055)',
  font: "'M PLUS Rounded 1c','Hiragino Maru Gothic ProN','Segoe UI','Hiragino Sans',sans-serif",
} as const;

/** カテゴリのアクセント（建築=空色 / 戦争=炎色） */
export function categoryAccent(category: 'build' | 'war'): string {
  return category === 'build' ? SG.build : SG.war;
}

/** せり上がり登場アニメーションのスタイル（delay 指定可） */
export function rise(delaySec: number): CSSProperties {
  return {
    animation: `sgRise 0.5s cubic-bezier(0.22,1,0.36,1) both`,
    animationDelay: `${delaySec}s`,
  };
}

/** セクションの小見出し（STEP ラベル）の共通スタイル */
export function eyebrow(accent: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    color: SG.textDim,
    fontFamily: SG.font,
    fontWeight: 800,
    letterSpacing: 1.5,
    lineHeight: 1,
    // accent はステップ番号バッジ側で使う
    ['--sg-eyebrow-accent' as string]: accent,
  };
}

/** ガラスパネルの共通スタイル */
export function glassPanel(accentGlow?: string): CSSProperties {
  return {
    background: SG.surface0,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: `1px solid ${SG.line}`,
    borderRadius: 'var(--sg-r-lg)',
    boxShadow: accentGlow
      ? `var(--sg-shadow), 0 0 28px ${accentGlow}`
      : 'var(--sg-shadow)',
  };
}

/**
 * ゲーム中 HUD の軽量フロステッドガラス。
 * 不透明カードで世界を覆わないよう、低不透明度＋強めの blur で「透けて見える」面にする。
 * テキスト側で textShadow を併用して可読性を確保すること。
 */
export function hudGlass(accent?: string): CSSProperties {
  return {
    background: 'rgba(9,12,18,0.34)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: `1px solid ${accent ? `${accent}3a` : 'rgba(255,255,255,0.1)'}`,
    borderRadius: 'var(--sg-r-md)',
    boxShadow: '0 6px 22px rgba(0,0,0,0.3)',
    fontFamily: SG.font,
  };
}

/** HUD テキストの可読性を保つ標準シャドウ（透過面の上でも読める） */
export const HUD_TEXT_SHADOW = '0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.7)';
