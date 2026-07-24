// TNT爆発ロジック
// TNTブロックを破壊（左クリック）すると爆発し、周囲のブロックを吹き飛ばす
// 爆発半径内のモブにもダメージを与える

import { useWorldStore } from '../stores/useWorldStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useMobStore } from '../stores/useMobStore';
import { BLOCK_IDS, BLOCK_DEFS } from '../types/blocks';
import { spawnBlockBreakEffect, spawnCombatExplosion } from './effectTriggers';
import { playTntExplosionSound } from './sounds';

/** TNT爆発の半径 */
const EXPLOSION_RADIUS = 4;
/** TNT爆発のプレイヤーダメージ（最大） */
const EXPLOSION_MAX_DAMAGE = 12;
/** TNT連鎖爆発の遅延（ms） */
const CHAIN_DELAY = 150;

/**
 * TNT爆発を実行する
 * @param x TNTブロックのX座標
 * @param y TNTブロックのY座標
 * @param z TNTブロックのZ座標
 * @param playerPos プレイヤー位置 [x, y, z]（省略時はダメージ計算スキップ）
 */
export function triggerTntExplosion(
  x: number, y: number, z: number,
  playerPos?: [number, number, number],
): void {
  const worldStore = useWorldStore.getState();
  const playerStore = usePlayerStore.getState();
  const mobStore = useMobStore.getState();

  // 爆発範囲のブロックを破壊（球状）
  const chainTnts: { x: number; y: number; z: number }[] = [];

  for (let dx = -EXPLOSION_RADIUS; dx <= EXPLOSION_RADIUS; dx++) {
    for (let dy = -EXPLOSION_RADIUS; dy <= EXPLOSION_RADIUS; dy++) {
      for (let dz = -EXPLOSION_RADIUS; dz <= EXPLOSION_RADIUS; dz++) {
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > EXPLOSION_RADIUS) continue;

        const bx = x + dx;
        const by = y + dy;
        const bz = z + dz;

        const blockId = worldStore.getBlock(bx, by, bz);
        if (blockId === BLOCK_IDS.AIR || blockId === BLOCK_IDS.WATER) continue;

        const def = BLOCK_DEFS[blockId];
        if (def?.unbreakable) continue;

        // 連鎖TNT検出
        if (def?.explosive && !(dx === 0 && dy === 0 && dz === 0)) {
          chainTnts.push({ x: bx, y: by, z: bz });
        }

        // ブロック破壊
        worldStore.breakBlock(bx, by, bz);
        spawnBlockBreakEffect(blockId, bx, by, bz);
      }
    }
  }

  // 視覚的な爆発FX（衝撃波・火花・煙・破片）
  spawnCombatExplosion(x + 0.5, y + 0.5, z + 0.5, {
    style: 'tnt',
    intensity: 1 + Math.min(1.2, chainTnts.length * 0.15),
    accent: '#ff8a2a',
  });

  // プレイヤーへのダメージ（距離減衰）
  if (playerPos) {
    const [px, py, pz] = playerPos;
    const playerDist = Math.sqrt((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);

    // 爆発音（プレイヤー距離に基づく音量）
    playTntExplosionSound(playerDist, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });

    // カメラシェイク（距離に応じて減衰）— CombatExplosionFX 側と合算
    const shakeFactor = Math.max(0, 1 - playerDist / (EXPLOSION_RADIUS * 2));
    if (shakeFactor > 0) {
      usePlayerStore.setState((state) => ({
        cameraShake: Math.min(1, Math.max(state.cameraShake, shakeFactor * 0.88)),
      }));
    }

    if (playerDist < EXPLOSION_RADIUS * 1.5) {
      const damageFactor = 1 - playerDist / (EXPLOSION_RADIUS * 1.5);
      const damage = Math.ceil(EXPLOSION_MAX_DAMAGE * damageFactor);
      if (damage > 0) {
        playerStore.takeDamage(damage);
        // ノックバック
        const kbX = playerDist > 0 ? (px - x) / playerDist : 0;
        const kbZ = playerDist > 0 ? (pz - z) / playerDist : 0;
        usePlayerStore.setState({
          knockbackVx: kbX * 8,
          knockbackVz: kbZ * 8,
        });
      }
    }
  } else {
    // playerPos なしでも音は鳴らす（距離0で最大音量）
    playTntExplosionSound(0, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  }

  // モブへのダメージ
  for (const mob of mobStore.mobs) {
    const mobDist = Math.sqrt((mob.x - x) ** 2 + (mob.y - y) ** 2 + (mob.z - z) ** 2);
    if (mobDist < EXPLOSION_RADIUS * 1.5) {
      const damageFactor = 1 - mobDist / (EXPLOSION_RADIUS * 1.5);
      const damage = Math.ceil(EXPLOSION_MAX_DAMAGE * damageFactor);
      if (damage > 0) {
        // 爆発ノックバックはごく弱く
        const kbX = mobDist > 0 ? ((mob.x - x) / mobDist) * 0.5 * damageFactor : 0;
        const kbZ = mobDist > 0 ? ((mob.z - z) / mobDist) * 0.5 * damageFactor : 0;
        mobStore.damageMob(mob.id, damage, kbX, kbZ);
      }
    }
  }

  // 連鎖爆発（遅延付き）
  chainTnts.forEach((tnt, i) => {
    setTimeout(() => {
      const currentBlock = useWorldStore.getState().getBlock(tnt.x, tnt.y, tnt.z);
      // まだTNTが残っている場合のみ連鎖
      if (currentBlock === BLOCK_IDS.TNT) {
        useWorldStore.getState().breakBlock(tnt.x, tnt.y, tnt.z);
        triggerTntExplosion(tnt.x, tnt.y, tnt.z, playerPos);
      }
    }, CHAIN_DELAY * (i + 1));
  });
}
