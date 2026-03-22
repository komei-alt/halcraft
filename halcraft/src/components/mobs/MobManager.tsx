// モブマネージャーコンポーネント
// ゾンビのスポーン、AI（追尾）、物理、プレイヤーへの接触ダメージを管理

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { useMobStore, type MobData } from '../../stores/useMobStore';
import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { getTerrainHeight } from '../../utils/terrain';
import { BLOCK_IDS } from '../../types/blocks';
import { Zombie } from './Zombie';

/** ゾンビの定数 */
const ZOMBIE_SPEED = 2.5;
const ZOMBIE_ATTACK_RANGE = 1.2;
const ZOMBIE_ATTACK_DAMAGE = 2;
const ZOMBIE_ATTACK_COOLDOWN = 1.0; // 秒
const MOB_GRAVITY = -20;
const MOB_HEIGHT = 1.8;
const MOB_RADIUS = 0.3;

export function MobManager() {
  const { camera } = useThree();
  const mobs = useMobStore((s) => s.mobs);
  const setMobs = useMobStore((s) => s.setMobs);
  const trySpawnZombie = useMobStore((s) => s.trySpawnZombie);
  const despawnFarMobs = useMobStore((s) => s.despawnFarMobs);
  const clearAllMobs = useMobStore((s) => s.clearAllMobs);
  const getBlock = useWorldStore((s) => s.getBlock);
  const takeDamage = usePlayerStore((s) => s.takeDamage);

  // アニメーション時間
  const animTime = useRef(0);
  // 攻撃クールダウン
  const attackCooldown = useRef(0);
  // 前フレームの夜判定
  const wasNight = useRef(false);

  // ブロック衝突チェック（モブ用）
  const checkMobCollision = (px: number, py: number, pz: number): boolean => {
    const minX = px - MOB_RADIUS;
    const maxX = px + MOB_RADIUS;
    const minY = py;
    const maxY = py + MOB_HEIGHT;
    const minZ = pz - MOB_RADIUS;
    const maxZ = pz + MOB_RADIUS;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
          if (getBlock(bx, by, bz) !== BLOCK_IDS.AIR) {
            if (
              maxX > bx && minX < bx + 1 &&
              maxY > by && minY < by + 1 &&
              maxZ > bz && minZ < bz + 1
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const gameState = useGameStore.getState();
    const playerState = usePlayerStore.getState();

    if (gameState.phase !== 'playing' || playerState.isDead) return;

    animTime.current += dt;
    attackCooldown.current = Math.max(0, attackCooldown.current - dt);

    const isNight = gameState.isNight;
    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    const playerY = camera.position.y - 1.6; // 足元

    // 夜→昼の切り替わりで全モブ削除
    if (wasNight.current && !isNight) {
      clearAllMobs();
    }
    wasNight.current = isNight;

    // 夜間のみスポーン
    if (isNight) {
      trySpawnZombie(playerX, playerZ, (x, z) => getTerrainHeight(x, z));
    }

    // 遠すぎるモブの削除
    despawnFarMobs(playerX, playerZ);

    // 各モブのAI・物理更新
    const currentMobs = useMobStore.getState().mobs;
    if (currentMobs.length === 0) return;

    const updatedMobs: MobData[] = [];
    let playerWasHit = false;

    for (const mob of currentMobs) {
      const m = { ...mob };

      // ヒットタイマーの減算
      m.hitTimer = Math.max(0, m.hitTimer - dt);

      // --- AI: プレイヤーに向かって歩く ---
      const dx = playerX - m.x;
      const dz = playerZ - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        // プレイヤーの方を向く
        m.rotation = Math.atan2(dx, dz);

        // ノックバック中でなければ移動
        if (m.hitTimer <= 0) {
          const nx = dx / dist;
          const nz = dz / dist;
          m.vx = nx * ZOMBIE_SPEED;
          m.vz = nz * ZOMBIE_SPEED;
        }
      } else {
        m.vx = 0;
        m.vz = 0;
      }

      // --- 重力 ---
      m.vy += MOB_GRAVITY * dt;
      if (m.vy < -30) m.vy = -30;

      // --- Y軸衝突 ---
      const newY = m.y + m.vy * dt;
      if (checkMobCollision(m.x, newY, m.z)) {
        if (m.vy < 0) {
          const footBlockY = Math.floor(newY);
          m.y = footBlockY + 1;
        }
        m.vy = 0;
      } else {
        m.y = newY;
      }

      // --- X軸衝突 ---
      const newX = m.x + m.vx * dt;
      if (checkMobCollision(newX, m.y, m.z)) {
        // 段差ジャンプ（1ブロック上にスペースがあれば飛び上がる）
        if (!checkMobCollision(newX, m.y + 1, m.z)) {
          m.vy = 6;
          m.x = newX;
        } else {
          m.vx = 0;
        }
      } else {
        m.x = newX;
      }

      // --- Z軸衝突 ---
      const newZ = m.z + m.vz * dt;
      if (checkMobCollision(m.x, m.y, newZ)) {
        if (!checkMobCollision(m.x, m.y + 1, newZ)) {
          m.vy = 6;
          m.z = newZ;
        } else {
          m.vz = 0;
        }
      } else {
        m.z = newZ;
      }

      // --- ヒットタイマー中のノックバック減衰 ---
      if (m.hitTimer > 0) {
        m.vx *= 0.9;
        m.vz *= 0.9;
      }

      // --- プレイヤーとの接触判定 ---
      const playerDx = m.x - playerX;
      const playerDy = m.y - playerY;
      const playerDz = m.z - playerZ;
      const playerDist = Math.sqrt(playerDx * playerDx + playerDy * playerDy + playerDz * playerDz);

      if (playerDist < ZOMBIE_ATTACK_RANGE && attackCooldown.current <= 0) {
        playerWasHit = true;
        attackCooldown.current = ZOMBIE_ATTACK_COOLDOWN;
      }

      // 落下で削除
      if (m.y < -20) continue;

      updatedMobs.push(m);
    }

    // プレイヤーへのダメージ適用
    if (playerWasHit) {
      takeDamage(ZOMBIE_ATTACK_DAMAGE);
    }

    setMobs(updatedMobs);
  });

  return (
    <group>
      {mobs.map((mob) => {
        switch (mob.type) {
          case 'zombie':
            return <Zombie key={mob.id} mob={mob} animTime={animTime.current} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
