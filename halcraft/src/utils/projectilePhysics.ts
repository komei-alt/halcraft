// 弾道物理ユーティリティ
// レイマーチングベースのプロジェクタイルシステム共通ロジック
// MachineGun / TurretRenderer から利用

import * as THREE from 'three';
import { BLOCK_IDS, type BlockId } from '../types/blocks';
import { getMobHitbox, getMobHitboxMaxY, getMobHitboxMinY } from './mobHitboxes';

// ─── 共通型定義 ──────────────────────────────────────────

/** getBlock 関数の型 */
export type GetBlockFn = (x: number, y: number, z: number) => BlockId;

/** モブ判定対象の最小データ */
export interface HitTarget {
  id: string;
  type?: string;
  x: number;
  y: number;
  z: number;
  hp: number;
}

/** レイマーチングの衝突結果 */
export interface RayHitResult {
  /** 衝突種別 */
  type: 'block' | 'mob' | 'player' | 'none';
  /** 衝突位置 */
  hitPos: THREE.Vector3;
  /** 衝突面の法線（パーティクル飛散方向用） */
  normal: THREE.Vector3;
  /** 衝突したモブのID（モブ衝突時のみ） */
  targetId?: string;
}

/** リモートプレイヤーの最小データ */
export interface RemotePlayerTarget {
  id: string;
  position: [number, number, number];
  isDead: boolean;
}

/**
 * レイマーチングで弾丸を一定距離進め、ブロック・モブとの衝突を判定する
 *
 * @param startPos 弾丸の現在位置（破壊的に更新される）
 * @param moveDir 移動方向（正規化済み）
 * @param moveDist 今フレームの移動距離
 * @param getBlock ブロック取得関数
 * @param mobs 衝突対象のモブ配列
 * @param mobHitRadius モブのヒット判定半径
 * @param options.excludeBlockIds 衝突を無視するブロックID群
 * @param options.remotePlayers リモートプレイヤー判定対象（省略時はスキップ）
 * @param options.playerHitRadius プレイヤーヒット半径
 * @param options.playerHitHeight プレイヤーヒット高さ
 */
export function rayMarchProjectile(
  startPos: THREE.Vector3,
  moveDir: THREE.Vector3,
  moveDist: number,
  getBlock: GetBlockFn,
  mobs: HitTarget[],
  mobHitRadius: number,
  options?: {
    excludeBlockIds?: Set<BlockId>;
    remotePlayers?: Map<string, RemotePlayerTarget>;
    playerHitRadius?: number;
    playerHitHeight?: number;
  },
): RayHitResult {
  const steps = Math.max(1, Math.ceil(moveDist / 0.5));
  const stepSize = moveDist / steps;
  const excludeBlocks = options?.excludeBlockIds ?? new Set<BlockId>();

  for (let s = 0; s < steps; s++) {
    startPos.addScaledVector(moveDir, stepSize);

    // ─── ブロック衝突判定 ───
    const bx = Math.floor(startPos.x);
    const by = Math.floor(startPos.y);
    const bz = Math.floor(startPos.z);

    const blockId = getBlock(bx, by, bz);
    if (blockId !== BLOCK_IDS.AIR && !excludeBlocks.has(blockId)) {
      return {
        type: 'block',
        hitPos: startPos.clone(),
        normal: moveDir.clone().negate().normalize(),
      };
    }

    // ─── モブ衝突判定 ───
    for (const mob of mobs) {
      if (mob.hp <= 0) continue;
      const hitbox = getMobHitbox(mob.type, mobHitRadius);
      const minY = getMobHitboxMinY(mob.y, hitbox);
      const maxY = getMobHitboxMaxY(mob.y, hitbox);
      const hitY = Math.max(minY, Math.min(maxY, startPos.y));
      const dx = startPos.x - mob.x;
      const dy = startPos.y - hitY;
      const dz = startPos.z - mob.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const radius = Math.max(mobHitRadius, hitbox.radius);

      if (dist < radius) {
        const mobCenter = new THREE.Vector3(mob.x, mob.y + hitbox.height * 0.5, mob.z);
        return {
          type: 'mob',
          hitPos: startPos.clone(),
          normal: startPos.clone().sub(mobCenter).normalize(),
          targetId: mob.id,
        };
      }
    }

    // ─── リモートプレイヤー衝突判定 ───
    if (options?.remotePlayers) {
      const pRadius = options.playerHitRadius ?? 0.5;
      const pHeight = options.playerHitHeight ?? 1.7;

      for (const [, rp] of options.remotePlayers) {
        if (rp.isDead) continue;
        const px = rp.position[0];
        const py = rp.position[1];
        const pz = rp.position[2];
        const dx = startPos.x - px;
        const dz = startPos.z - pz;
        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
        const verticalInRange = startPos.y >= py && startPos.y <= py + pHeight;

        if (horizontalDist < pRadius && verticalInRange) {
          const playerCenter = new THREE.Vector3(px, py + pHeight * 0.5, pz);
          return {
            type: 'player',
            hitPos: startPos.clone(),
            normal: startPos.clone().sub(playerCenter).normalize(),
            targetId: rp.id,
          };
        }
      }
    }
  }

  return {
    type: 'none',
    hitPos: startPos.clone(),
    normal: new THREE.Vector3(0, 1, 0),
  };
}

/**
 * インパクトパーティクルの初速度を生成する
 *
 * @param count パーティクル数
 * @param normal 衝突面の法線
 * @param spreadForce 散布力の強さ
 */
export function generateImpactParticles(
  count: number,
  normal: THREE.Vector3,
  spreadForce: number = 4,
): Array<{ vel: THREE.Vector3; pos: THREE.Vector3; size: number }> {
  const particles: Array<{ vel: THREE.Vector3; pos: THREE.Vector3; size: number }> = [];
  for (let i = 0; i < count; i++) {
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * spreadForce,
      Math.random() * (spreadForce * 0.75) + 1,
      (Math.random() - 0.5) * spreadForce,
    );
    spread.addScaledVector(normal, Math.random() * (spreadForce * 0.75));
    particles.push({
      vel: spread,
      pos: new THREE.Vector3(0, 0, 0),
      size: 0.04 + Math.random() * 0.08,
    });
  }
  return particles;
}
