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
