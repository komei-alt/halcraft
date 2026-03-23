// ドロップアイテム状態の管理ストア
// ブロック破壊時にワールドに落ちるアイテムを管理する

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { type BlockId, BLOCK_IDS } from '../types/blocks';

/** ドロップアイテム1個の状態 */
export interface DroppedItem {
  /** ユニークID */
  id: string;
  /** ブロック種別 */
  blockId: BlockId;
  /** ワールド座標 */
  x: number;
  y: number;
  z: number;
  /** 速度（初期バウンス用） */
  vx: number;
  vy: number;
  vz: number;
  /** 生成時刻（自動消滅用） */
  spawnedAt: number;
  /** ピックアップ可能になる時刻（飛び散り中は拾えない） */
  pickupableAt: number;
  /** ピックアップ中フラグ（プレイヤーに吸い込まれ中） */
  beingPickedUp: boolean;
}

/** ドロップアイテムの生存時間（ms） */
const ITEM_LIFETIME = 60_000; // 60秒
/** ピックアップ不可時間（ms） */
const PICKUP_DELAY = 500;
/** 一度にワールドに存在できるアイテム数の上限 */
const MAX_ITEMS = 128;

interface DroppedItemState {
  /** 全ドロップアイテム */
  items: DroppedItem[];

  /** アイテムをドロップ */
  dropItem: (blockId: BlockId, x: number, y: number, z: number) => void;

  /** アイテムを削除（ピックアップ完了時） */
  removeItem: (id: string) => void;

  /** アイテムをピックアップ中に設定 */
  startPickup: (id: string) => void;

  /** アイテムの位置を更新（物理シミュレーション用） */
  updateItemPosition: (id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number) => void;

  /** 期限切れアイテムを一括削除 */
  cleanupExpired: () => void;
}

export const useDroppedItemStore = create<DroppedItemState>((set) => ({
  items: [],

  dropItem: (blockId, x, y, z) => {
    // 空気ブロックと岩盤はドロップしない
    if (blockId === BLOCK_IDS.AIR || blockId === BLOCK_IDS.BEDROCK) return;

    const now = Date.now();
    // ランダムな方向にバウンス
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2;

    const item: DroppedItem = {
      id: uuidv4(),
      blockId,
      x: x + 0.5, // ブロック中心
      y: y + 0.5,
      z: z + 0.5,
      vx: Math.cos(angle) * speed,
      vy: 3 + Math.random() * 2, // 上方向にバウンス
      vz: Math.sin(angle) * speed,
      spawnedAt: now,
      pickupableAt: now + PICKUP_DELAY,
      beingPickedUp: false,
    };

    set((state) => {
      let newItems = [...state.items, item];
      // 上限を超えたら古いものから削除
      if (newItems.length > MAX_ITEMS) {
        newItems = newItems.slice(newItems.length - MAX_ITEMS);
      }
      return { items: newItems };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  startPickup: (id) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, beingPickedUp: true } : item,
      ),
    }));
  },

  updateItemPosition: (id, x, y, z, vx, vy, vz) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, x, y, z, vx, vy, vz } : item,
      ),
    }));
  },

  cleanupExpired: () => {
    const now = Date.now();
    set((state) => ({
      items: state.items.filter((item) => now - item.spawnedAt < ITEM_LIFETIME),
    }));
  },
}));
