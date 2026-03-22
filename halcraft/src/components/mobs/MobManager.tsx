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
import { Prototype } from './Prototype';

/** ゾンビの定数 */
const ZOMBIE_SPEED = 2.5;
const ZOMBIE_ATTACK_RANGE = 1.2;
const ZOMBIE_ATTACK_DAMAGE = 2;
const ZOMBIE_ATTACK_COOLDOWN = 1.0; // 秒
const MOB_GRAVITY = -20;
const MOB_HEIGHT = 1.8;
const MOB_RADIUS = 0.3;

/** プロトタイプ（味方）の定数 */
const PROTOTYPE_SPEED = 2.0;         // プレイヤー追従速度
const PROTOTYPE_FOLLOW_MIN = 4;      // これ以上離れたら追従開始
const PROTOTYPE_FOLLOW_MAX = 20;     // これ以上離れたらテレポート
const PROTOTYPE_ATTACK_RANGE = 2.5;  // ゾンビへの攻撃範囲
const PROTOTYPE_ATTACK_DAMAGE = 5;   // ゾンビへの攻撃ダメージ
const PROTOTYPE_ATTACK_COOLDOWN = 0.8;
const PROTOTYPE_HEIGHT = 4.5;        // 大きいサイズ
const PROTOTYPE_RADIUS = 1.0;

export function MobManager() {
  const { camera } = useThree();
  const mobs = useMobStore((s) => s.mobs);
  const setMobs = useMobStore((s) => s.setMobs);
  const trySpawnZombie = useMobStore((s) => s.trySpawnZombie);
  const trySpawnPrototype = useMobStore((s) => s.trySpawnPrototype);
  const despawnFarMobs = useMobStore((s) => s.despawnFarMobs);
  const getBlock = useWorldStore((s) => s.getBlock);
  const takeDamage = usePlayerStore((s) => s.takeDamage);

  // アニメーション時間
  const animTime = useRef(0);
  // 攻撃クールダウン（ゾンビからプレイヤーへ）
  const attackCooldown = useRef(0);
  // プロトタイプの攻撃クールダウン
  const protoAttackCooldown = useRef(0);
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

  // ブロック衝突チェック（サイズ可変版）
  const checkMobCollisionSize = (px: number, py: number, pz: number, radius: number, height: number): boolean => {
    const minX = px - radius;
    const maxX = px + radius;
    const minY = py;
    const maxY = py + height;
    const minZ = pz - radius;
    const maxZ = pz + radius;

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
    protoAttackCooldown.current = Math.max(0, protoAttackCooldown.current - dt);

    const isNight = gameState.isNight;
    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    const playerY = camera.position.y - 1.6; // 足元

    // 夜→昼の切り替わりで敵モブ削除（味方は残す）
    if (wasNight.current && !isNight) {
      // ゾンビだけ削除
      const currentState = useMobStore.getState();
      useMobStore.getState().setMobs(currentState.mobs.filter((m) => m.isAlly));
    }
    wasNight.current = isNight;

    // 夜間のみゾンビスポーン
    if (isNight) {
      trySpawnZombie(playerX, playerZ, (x, z) => getTerrainHeight(x, z));
    }

    // プロトタイプ味方モブは常時スポーン（昼夜問わず）
    trySpawnPrototype(playerX, playerZ, (x, z) => getTerrainHeight(x, z));

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

      if (m.type === 'prototype') {
        // =======================================
        // 味方モブ（プロトタイプ）のAI
        // =======================================

        // プレイヤーまでの距離
        const dxP = playerX - m.x;
        const dzP = playerZ - m.z;
        const distP = Math.sqrt(dxP * dxP + dzP * dzP);

        // テレポート（遠すぎたらプレイヤーの近くに瞬間移動）
        if (distP > PROTOTYPE_FOLLOW_MAX) {
          const angle = Math.random() * Math.PI * 2;
          m.x = playerX + Math.cos(angle) * PROTOTYPE_FOLLOW_MIN;
          m.z = playerZ + Math.sin(angle) * PROTOTYPE_FOLLOW_MIN;
          m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 1;
          m.vx = 0;
          m.vz = 0;
          m.vy = 0;
        }

        // 近くのゾンビを探す
        let targetZombie: typeof m | null = null;
        let closestDist = PROTOTYPE_ATTACK_RANGE * 3; // 索敵範囲

        for (const other of currentMobs) {
          if (other.type === 'zombie') {
            const odx = other.x - m.x;
            const odz = other.z - m.z;
            const oDist = Math.sqrt(odx * odx + odz * odz);
            if (oDist < closestDist) {
              closestDist = oDist;
              targetZombie = other;
            }
          }
        }

        if (targetZombie) {
          // ゾンビに向かって移動
          const tdx = targetZombie.x - m.x;
          const tdz = targetZombie.z - m.z;
          const tDist = Math.sqrt(tdx * tdx + tdz * tdz);
          m.rotation = Math.atan2(tdx, tdz);

          if (tDist > PROTOTYPE_ATTACK_RANGE) {
            const nx = tdx / tDist;
            const nz = tdz / tDist;
            m.vx = nx * PROTOTYPE_SPEED * 1.5;
            m.vz = nz * PROTOTYPE_SPEED * 1.5;
          } else {
            m.vx = 0;
            m.vz = 0;

            // 攻撃
            if (protoAttackCooldown.current <= 0) {
              const kbX = tdx / tDist;
              const kbZ = tdz / tDist;
              useMobStore.getState().damageMob(targetZombie.id, PROTOTYPE_ATTACK_DAMAGE, kbX, kbZ);
              protoAttackCooldown.current = PROTOTYPE_ATTACK_COOLDOWN;
            }
          }
        } else if (distP > PROTOTYPE_FOLLOW_MIN) {
          // ゾンビがいなければプレイヤーに追従
          const nx = dxP / distP;
          const nz = dzP / distP;
          m.rotation = Math.atan2(dxP, dzP);
          m.vx = nx * PROTOTYPE_SPEED;
          m.vz = nz * PROTOTYPE_SPEED;
        } else {
          // 近くにいる場合は停止
          m.vx = 0;
          m.vz = 0;
          // プレイヤーの方を向く
          if (distP > 0.1) {
            m.rotation = Math.atan2(dxP, dzP);
          }
        }

        // 重力
        m.vy += MOB_GRAVITY * dt;
        if (m.vy < -30) m.vy = -30;

        // Y軸衝突（プロトタイプ用サイズ）
        const newYP = m.y + m.vy * dt;
        if (checkMobCollisionSize(m.x, newYP, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
          if (m.vy < 0) {
            const footBlockY = Math.floor(newYP);
            m.y = footBlockY + 1;
          }
          m.vy = 0;
        } else {
          m.y = newYP;
        }

        // X軸衝突
        const newXP = m.x + m.vx * dt;
        if (checkMobCollisionSize(newXP, m.y, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
          if (!checkMobCollisionSize(newXP, m.y + 1, m.z, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
            m.vy = 6;
            m.x = newXP;
          } else {
            m.vx = 0;
          }
        } else {
          m.x = newXP;
        }

        // Z軸衝突
        const newZP = m.z + m.vz * dt;
        if (checkMobCollisionSize(m.x, m.y, newZP, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
          if (!checkMobCollisionSize(m.x, m.y + 1, newZP, PROTOTYPE_RADIUS, PROTOTYPE_HEIGHT)) {
            m.vy = 6;
            m.z = newZP;
          } else {
            m.vz = 0;
          }
        } else {
          m.z = newZP;
        }

        // 落下でリスポーン
        if (m.y < -20) {
          m.x = playerX + 3;
          m.z = playerZ + 3;
          m.y = getTerrainHeight(Math.floor(m.x), Math.floor(m.z)) + 2;
          m.vy = 0;
        }

        updatedMobs.push(m);
        continue;
      }

      // =======================================
      // 敵モブ（ゾンビ）のAI
      // =======================================

      // --- AI: プレイヤーに向かって歩く ---
      const dx = playerX - m.x;
      const dz = playerZ - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > 0.5) {
        m.rotation = Math.atan2(dx, dz);

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
          case 'prototype':
            return <Prototype key={mob.id} mob={mob} animTime={animTime.current} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
