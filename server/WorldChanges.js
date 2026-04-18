// ============================================
// HalCraft — ブロック変更の永続化管理
// JSON ファイルベースで変更差分を保存（ステージ別）
// ============================================

import fs from 'fs';
import path from 'path';

export class WorldChanges {
  /**
   * @param {string} dataDir — data/ ディレクトリへの絶対パス
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
    
    // ステージごとのメモリ上のブロック変更マップ
    // Map<stageId, Map<"x,y,z", blockId>>
    /** @type {Map<string, Map<string, number>>} */
    this.changesByStage = new Map();

    // ステージごとのダーティフラグ（保存が必要か）
    /** @type {Map<string, boolean>} */
    this.dirtyByStage = new Map();

    // 自動保存タイマー
    this._saveInterval = null;
  }

  getFilePath(stageId) {
    return path.join(this.dataDir, `block_changes_${stageId}.json`);
  }

  getChangesMap(stageId) {
    if (!this.changesByStage.has(stageId)) {
      this.changesByStage.set(stageId, new Map());
      this.dirtyByStage.set(stageId, false);
      this.loadForStage(stageId);
    }
    return this.changesByStage.get(stageId);
  }

  loadForStage(stageId) {
    const file = this.getFilePath(stageId);
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        const data = JSON.parse(raw);
        const map = this.changesByStage.get(stageId);
        for (const [key, blockId] of Object.entries(data)) {
          map.set(key, blockId);
        }
        console.log(`[WorldChanges] ${stageId}: ${map.size} 件のブロック変更を読み込み`);
      }
    } catch (err) {
      console.error(`[WorldChanges] ${stageId} 読み込みエラー:`, err.message);
    }
  }

  /**
   * 初期化：自動保存開始
   */
  init() {
    // データディレクトリ作成
    fs.mkdirSync(this.dataDir, { recursive: true });

    // 5分ごとの自動保存
    this._saveInterval = setInterval(() => this.saveAll(), 5 * 60 * 1000);
  }

  /**
   * ブロック変更を記録
   */
  setBlock(stageId, x, y, z, blockId) {
    const map = this.getChangesMap(stageId);
    const key = `${x},${y},${z}`;
    map.set(key, blockId);
    this.dirtyByStage.set(stageId, true);
  }

  /**
   * 全ブロック変更を配列として取得（新規参加者に送信用）
   */
  getAllChanges(stageId) {
    const map = this.getChangesMap(stageId);
    const result = [];
    for (const [key, blockId] of map) {
      const [x, y, z] = key.split(',').map(Number);
      result.push({ x, y, z, blockId });
    }
    return result;
  }

  /**
   * ディスクに保存
   */
  saveAll() {
    for (const [stageId, isDirty] of this.dirtyByStage) {
      if (!isDirty) continue;
      
      const map = this.changesByStage.get(stageId);
      try {
        const data = Object.fromEntries(map);
        fs.writeFileSync(this.getFilePath(stageId), JSON.stringify(data), 'utf-8');
        this.dirtyByStage.set(stageId, false);
        console.log(`[WorldChanges] ${stageId}: ${map.size} 件保存完了`);
      } catch (err) {
        console.error(`[WorldChanges] ${stageId} 保存エラー:`, err.message);
      }
    }
  }

  /**
   * クリーンアップ
   */
  dispose() {
    if (this._saveInterval) {
      clearInterval(this._saveInterval);
    }
    this.saveAll();
  }
}
