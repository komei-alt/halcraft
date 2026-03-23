// ============================================
// HalCraft — ブロック変更の永続化管理
// JSON ファイルベースで変更差分を保存
// ============================================

import fs from 'fs';
import path from 'path';

export class WorldChanges {
  /**
   * @param {string} dataDir — data/ ディレクトリへの絶対パス
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.changesPath = path.join(dataDir, 'block_changes.json');

    // メモリ上のブロック変更マップ (key: "x,y,z" → blockId)
    /** @type {Map<string, number>} */
    this.changes = new Map();

    // ダーティフラグ（保存が必要か）
    this.dirty = false;

    // 自動保存タイマー
    this._saveInterval = null;
  }

  /**
   * 初期化：既存データを読み込み + 自動保存開始
   */
  init() {
    // データディレクトリ作成
    fs.mkdirSync(this.dataDir, { recursive: true });

    // 既存の変更データを読み込み
    try {
      if (fs.existsSync(this.changesPath)) {
        const raw = fs.readFileSync(this.changesPath, 'utf-8');
        const data = JSON.parse(raw);
        for (const [key, blockId] of Object.entries(data)) {
          this.changes.set(key, blockId);
        }
        console.log(`[WorldChanges] ${this.changes.size} 件のブロック変更を読み込み`);
      }
    } catch (err) {
      console.error('[WorldChanges] 読み込みエラー:', err.message);
    }

    // 5分ごとの自動保存
    this._saveInterval = setInterval(() => this.save(), 5 * 60 * 1000);
  }

  /**
   * ブロック変更を記録
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} blockId — 0 = AIR（破壊）
   */
  setBlock(x, y, z, blockId) {
    const key = `${x},${y},${z}`;
    this.changes.set(key, blockId);
    this.dirty = true;
  }

  /**
   * 全ブロック変更を配列として取得（新規参加者に送信用）
   * @returns {Array<{x: number, y: number, z: number, blockId: number}>}
   */
  getAllChanges() {
    const result = [];
    for (const [key, blockId] of this.changes) {
      const [x, y, z] = key.split(',').map(Number);
      result.push({ x, y, z, blockId });
    }
    return result;
  }

  /**
   * ディスクに保存
   */
  save() {
    if (!this.dirty) return;

    try {
      const data = Object.fromEntries(this.changes);
      fs.writeFileSync(this.changesPath, JSON.stringify(data), 'utf-8');
      this.dirty = false;
      console.log(`[WorldChanges] ${this.changes.size} 件保存完了`);
    } catch (err) {
      console.error('[WorldChanges] 保存エラー:', err.message);
    }
  }

  /**
   * クリーンアップ
   */
  dispose() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
    }
    this.save();
  }
}
