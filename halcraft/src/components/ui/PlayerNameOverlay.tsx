// ============================================
// PlayerNameOverlay — プレイヤー名 / 味方モブ名のHTMLオーバーレイ表示
// 3D座標をスクリーン投影し、CSSテキストで常にクリスプに表示
// 画面外の場合は矢印付きで方向を画面端に表示
// 対象: リモートプレイヤー + プロトタイプ味方モブ
// ============================================

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useMobStore } from '../../stores/useMobStore';

/** 画面端マージン（px） */
const EDGE_MARGIN = 60;
/** 名前ラベルの最小表示サイズ（px） */
const MIN_FONT_SIZE = 12;
/** 名前ラベルの最大表示サイズ（px） */
const MAX_FONT_SIZE = 16;
/** 画面外インジケーターの矢印サイズ */
const ARROW_SIZE = 16;

/** 表示対象の種別 */
type LabelType = 'player' | 'ally';

/** ラベルDOM要素 */
interface LabelElements {
  container: HTMLDivElement;
  nameSpan: HTMLSpanElement;
  arrow: HTMLDivElement;
  iconSpan: HTMLSpanElement;
  /** ドクロマーク（死亡時表示） */
  skullSpan: HTMLSpanElement;
  type: LabelType;
}

/**
 * Canvas外DOMでプレイヤー名・味方名を表示するコンポーネント。
 * useFrame内で毎フレーム投影座標を計算し、DOM直接操作（React再レンダリング不要）。
 */
export function PlayerNameOverlay() {
  const { camera, size } = useThree();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<Map<string, LabelElements>>(new Map());
  const projVec = useRef(new THREE.Vector3());

  // オーバーレイコンテナの作成
  useEffect(() => {
    const overlay = document.createElement('div');
    overlay.id = 'player-name-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 10;
      overflow: hidden;
    `;
    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    return () => {
      overlay.remove();
      overlayRef.current = null;
      labelsRef.current.clear();
    };
  }, []);

  /** ラベルDOM要素を作成 */
  const createLabel = useCallback((id: string, name: string, type: LabelType): LabelElements => {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      display: flex;
      align-items: center;
      gap: 5px;
      will-change: transform;
      white-space: nowrap;
      top: 0; left: 0;
      transition: opacity 0.2s;
    `;

    // ドクロマーク（死亡時のみ表示）
    const skullSpan = document.createElement('span');
    skullSpan.textContent = '☠️';
    skullSpan.style.cssText = `
      font-size: 16px;
      line-height: 1;
      display: none;
      animation: skull-pulse 1s ease-in-out infinite;
    `;
    container.appendChild(skullSpan);

    // アイコン（味方: ♥、プレイヤー: 発話時🎙️）
    const iconSpan = document.createElement('span');
    iconSpan.style.cssText = `font-size: 12px; line-height: 1; display: none;`;
    if (type === 'ally') {
      iconSpan.textContent = '♥';
      iconSpan.style.color = '#ff4488';
      iconSpan.style.display = 'inline';
    } else {
      iconSpan.textContent = '🎙️';
    }
    container.appendChild(iconSpan);

    // 名前テキスト
    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    const baseColor = type === 'ally' ? '#88ff88' : '#ffffff';
    nameSpan.style.cssText = `
      font-family: 'Segoe UI', 'Hiragino Sans', system-ui, sans-serif;
      font-weight: 700;
      font-size: 14px;
      color: ${baseColor};
      text-shadow:
        0 0 4px rgba(0,0,0,0.95),
        0 0 8px rgba(0,0,0,0.7),
        1px 1px 2px rgba(0,0,0,0.9);
      letter-spacing: 0.5px;
      line-height: 1;
      transition: color 0.3s;
    `;
    container.appendChild(nameSpan);

    // 方向矢印（画面外用）
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      width: ${ARROW_SIZE}px;
      height: ${ARROW_SIZE}px;
      display: none;
      flex-shrink: 0;
      clip-path: polygon(100% 50%, 0% 0%, 0% 100%);
      background: ${baseColor};
      opacity: 0.9;
    `;
    container.appendChild(arrow);

    overlayRef.current?.appendChild(container);
    const elements: LabelElements = { container, nameSpan, arrow, iconSpan, skullSpan, type };
    labelsRef.current.set(id, elements);
    return elements;
  }, []);

  /** ラベル削除 */
  const removeLabel = useCallback((id: string) => {
    const el = labelsRef.current.get(id);
    if (el) {
      el.container.remove();
      labelsRef.current.delete(id);
    }
  }, []);

  /** 1エンティティのラベルを更新する共通ロジック */
  const updateLabel = useCallback((
    label: LabelElements,
    worldX: number, worldY: number, worldZ: number,
    headOffset: number,
    cam: THREE.Camera,
    screenW: number, screenH: number,
    speaking: boolean,
    dead: boolean,
  ) => {
    // 3D頭上座標
    projVec.current.set(worldX, worldY + headOffset, worldZ);

    // カメラとの距離
    const dist = projVec.current.distanceTo(cam.position);

    // スクリーン座標に投影
    const projected = projVec.current.clone().project(cam);
    const screenX = (projected.x * 0.5 + 0.5) * screenW;
    const screenY = (-projected.y * 0.5 + 0.5) * screenH;
    const isBehind = projected.z > 1;

    // 距離に応じたフォントサイズ（一定範囲に固定してぼやけ防止）
    const fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, 14 + (10 - dist) * 0.3));
    label.nameSpan.style.fontSize = `${fontSize}px`;

    // 死亡/発話状態（プレイヤーのみ）
    if (label.type === 'player') {
      if (dead) {
        // ドクロマーク表示、名前を赤く、取り消し線
        label.skullSpan.style.display = 'inline';
        label.iconSpan.style.display = 'none';
        label.nameSpan.style.color = '#ff4444';
        label.nameSpan.style.textDecoration = 'line-through';
      } else {
        label.skullSpan.style.display = 'none';
        label.iconSpan.style.display = speaking ? 'inline' : 'none';
        label.nameSpan.style.color = speaking ? '#2ecc71' : '#ffffff';
        label.nameSpan.style.textDecoration = 'none';
      }
    }

    // 画面内判定
    const isOnScreen = screenX >= 0 && screenX <= screenW
      && screenY >= 0 && screenY <= screenH
      && !isBehind;

    if (isOnScreen) {
      // --- 画面内表示 ---
      label.container.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%)`;
      label.container.style.opacity = '1';
      label.arrow.style.display = 'none';
      label.container.style.background = 'none';
      label.container.style.padding = '0';
      label.container.style.borderRadius = '0';
    } else {
      // --- 画面外: 画面端にインジケーター表示 ---
      let dirX: number;
      let dirY: number;

      if (isBehind) {
        dirX = -(screenX - screenW / 2);
        dirY = -(screenY - screenH / 2);
      } else {
        dirX = screenX - screenW / 2;
        dirY = screenY - screenH / 2;
      }

      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len > 0) { dirX /= len; dirY /= len; }

      // 画面端にクランプ
      const clampX = Math.max(EDGE_MARGIN, Math.min(screenW - EDGE_MARGIN,
        screenW / 2 + dirX * (screenW / 2 - EDGE_MARGIN)));
      const clampY = Math.max(EDGE_MARGIN, Math.min(screenH - EDGE_MARGIN,
        screenH / 2 + dirY * (screenH / 2 - EDGE_MARGIN)));

      label.container.style.transform = `translate(${clampX}px, ${clampY}px) translate(-50%, -50%)`;
      label.container.style.opacity = '0.85';
      label.container.style.background = 'rgba(0, 0, 0, 0.5)';
      label.container.style.padding = '3px 8px';
      label.container.style.borderRadius = '4px';

      // 矢印
      const angle = Math.atan2(dirY, dirX);
      label.arrow.style.display = 'block';
      label.arrow.style.transform = `rotate(${angle}rad)`;
      // 矢印を名前の外側に配置
      label.arrow.style.order = dirX < 0 ? '1' : '-1';
    }
  }, []);

  useFrame(() => {
    const remotePlayers = useMultiplayerStore.getState().remotePlayers;
    const mobs = useMobStore.getState().mobs;
    const screenW = size.width;
    const screenH = size.height;

    // 現在有効なIDセットを構築
    const activeIds = new Set<string>();

    // --- リモートプレイヤー ---
    for (const [id, player] of remotePlayers) {
      activeIds.add(id);
      let label = labelsRef.current.get(id);
      if (!label) {
        label = createLabel(id, player.name, 'player');
      }
      // 名前更新
      if (label.nameSpan.textContent !== player.name) {
        label.nameSpan.textContent = player.name;
      }
      updateLabel(
        label,
        player.position[0], player.position[1], player.position[2],
        2.4, // プレイヤーの頭上
        camera, screenW, screenH,
        player.speaking,
        player.isDead,
      );
    }

    // --- 味方モブ（プロトタイプ） ---
    for (const mob of mobs) {
      if (mob.type !== 'prototype') continue;
      const mobLabelId = `mob_${mob.id}`;
      activeIds.add(mobLabelId);
      let label = labelsRef.current.get(mobLabelId);
      if (!label) {
        label = createLabel(mobLabelId, 'プロトタイプ', 'ally');
      }
      updateLabel(
        label,
        mob.x, mob.y, mob.z,
        4.2, // プロトタイプの頭上（大きいモブ）
        camera, screenW, screenH,
        false,
        false,
      );
    }

    // 不要なラベルを削除
    for (const [id] of labelsRef.current) {
      if (!activeIds.has(id)) {
        removeLabel(id);
      }
    }
  });

  return null;
}
