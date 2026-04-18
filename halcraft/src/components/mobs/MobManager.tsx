// モブマネージャーコンポーネント
// モブのスポーン、AI委譲、描画のオーケストレータ
// マルチプレイ時: オーナーのみAI計算、非オーナーは描画のみ

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState, useCallback } from 'react';
import { useMobStore, type MobData } from '../../stores/useMobStore';
import { useGameStore } from '../../stores/useGameStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useWorldStore } from '../../stores/useWorldStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useDroppedItemStore } from '../../stores/useDroppedItemStore';
import { getTerrainHeight } from '../../utils/terrain';
import { BLOCK_IDS } from '../../types/blocks';
import { checkAABBCollision } from '../../utils/collision';
import { Zombie } from './Zombie';
import { Prototype } from './Prototype';
import { Chicken } from './Chicken';
import { Spider } from './Spider';
import { IronGolem } from './IronGolem';
import { BossRenderer } from './BossRenderer';
import { playHurtSound, playMobDeathSound } from '../../utils/sounds';
import { spawnMobDeathEffect } from '../../utils/effectTriggers';
import {
  updateChickenAI, type ChickenState,
  updateSpiderAI, type SpiderState,
  updateZombieAI, type ZombieState,
  updateAllyMobAI, type AllyMobState,
  updateBossAI, type BossState,
  type MobAIContext,
} from '../../utils/mobAI';

export function MobManager() {
  const { camera } = useThree();
  const mobs = useMobStore((s) => s.mobs);
  const setMobs = useMobStore((s) => s.setMobs);
  const trySpawnZombie = useMobStore((s) => s.trySpawnZombie);
  const trySpawnChicken = useMobStore((s) => s.trySpawnChicken);
  const trySpawnSpider = useMobStore((s) => s.trySpawnSpider);
  const despawnFarMobs = useMobStore((s) => s.despawnFarMobs);
  const getBlock = useWorldStore((s) => s.getBlock);
  const breakBlock = useWorldStore((s) => s.breakBlock);
  const takeDamage = usePlayerStore((s) => s.takeDamage);
  const updateRegen = usePlayerStore((s) => s.updateRegen);
  const damageCore = useGameStore((s) => s.damageCore);
  const consumeDeathEvents = useMobStore((s) => s.consumeDeathEvents);
  const dropItem = useDroppedItemStore((s) => s.dropItem);

  // アニメーション時間（ref = 物理演算用、state = レンダリング用）
  const animTimeRef = useRef(0);
  const lastAnimSync = useRef(0);
  const [animTimeValue, setAnimTimeValue] = useState(0);

  // 前フレームの夜判定
  const wasNight = useRef(false);

  // --- モブ種別ごとの状態 ---
  const zombieState = useRef<ZombieState>({ attackCooldown: 0, flankTimer: 0 });
  const spiderState = useRef<SpiderState>({ attackCooldown: 0 });
  const chickenState = useRef<ChickenState>({
    wanderTimers: new Map(),
    wanderDirs: new Map(),
  });
  const allyState = useRef<AllyMobState>({
    attackCooldown: 0,
    stuckTimer: 0,
    lastPos: { x: 0, z: 0 },
  });
  const bossState = useRef<BossState>({
    attackCooldown: 0,
    summonCooldown: 0,
  });

  // 衝突チェック関数（可変サイズ版）
  const checkCollisionFn = useCallback(
    (px: number, py: number, pz: number, radius: number, height: number): boolean =>
      checkAABBCollision(getBlock, px, py, pz, radius, height),
    [getBlock],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const gameState = useGameStore.getState();
    const playerState = usePlayerStore.getState();

    if (gameState.phase !== 'playing' || playerState.isDead) return;

    // マルチプレイ時はサーバーがAI計算するのでスキップ（描画のみ）
    const isMultiplayer = useMultiplayerStore.getState().connected;
    if (isMultiplayer) {
      animTimeRef.current += dt;
      return;
    }

    animTimeRef.current += dt;
    zombieState.current.attackCooldown = Math.max(0, zombieState.current.attackCooldown - dt);
    spiderState.current.attackCooldown = Math.max(0, spiderState.current.attackCooldown - dt);
    allyState.current.attackCooldown = Math.max(0, allyState.current.attackCooldown - dt);
    bossState.current.attackCooldown = Math.max(0, bossState.current.attackCooldown - dt);
    zombieState.current.flankTimer += dt;

    // HP回復を毎フレーム更新
    updateRegen(dt);

    const isNight = gameState.isNight;
    const playerX = camera.position.x;
    const playerZ = camera.position.z;
    const playerY = camera.position.y - 1.6; // 足元

    // 夜→昼の切り替わりで敵モブ削除（味方は残す）
    if (wasNight.current && !isNight) {
      const currentState = useMobStore.getState();
      useMobStore.getState().setMobs(currentState.mobs.filter((m) => m.isAlly));
    }
    wasNight.current = isNight;

    // 夜間のみゾンビ・クモスポーン
    if (isNight) {
      trySpawnZombie(playerX, playerZ, (x, z) => getTerrainHeight(x, z));
      trySpawnSpider(playerX, playerZ, (x, z) => getTerrainHeight(x, z));
    }

    // 昼間はニワトリスポーン
    if (!isNight) {
      trySpawnChicken(playerX, playerZ, (x, z) => getTerrainHeight(x, z));
    }

    // SPAWNERブロックベースのアイアンゴーレムスポーン
    const SPAWNER_SEARCH_RANGE = 16;
    const golemCount = useMobStore.getState().mobs.filter((m) => m.type === 'iron_golem').length;
    const MAX_GOLEMS_FROM_SPAWNER = 3;
    if (golemCount < MAX_GOLEMS_FROM_SPAWNER) {
      const now = performance.now() / 1000;
      const lastProtoSpawn = useMobStore.getState().lastProtoSpawnTime;
      if (now - lastProtoSpawn > 10) {
        for (let dx = -SPAWNER_SEARCH_RANGE; dx <= SPAWNER_SEARCH_RANGE; dx += 2) {
          for (let dz = -SPAWNER_SEARCH_RANGE; dz <= SPAWNER_SEARCH_RANGE; dz += 2) {
            const sx = Math.floor(playerX) + dx;
            const sz = Math.floor(playerZ) + dz;
            const surfaceY = getTerrainHeight(sx, sz);
            for (let dy = -2; dy <= 5; dy++) {
              if (getBlock(sx, surfaceY + dy, sz) === BLOCK_IDS.SPAWNER) {
                useMobStore.getState().spawnMob('iron_golem', sx + 0.5, surfaceY + dy + 2, sz + 0.5);
                useMobStore.setState({ lastProtoSpawnTime: now });
                dx = SPAWNER_SEARCH_RANGE + 1;
                dz = SPAWNER_SEARCH_RANGE + 1;
                break;
              }
            }
          }
        }
      }
    }

    // 遠すぎるモブの削除
    despawnFarMobs(playerX, playerZ);

    // 各モブのAI・物理更新
    const currentMobs = useMobStore.getState().mobs;
    if (currentMobs.length === 0) return;

    const updatedMobs: MobData[] = [];
    let zombieHitMob: MobData | null = null;

    // 共通AIコンテキスト
    const aiCtx: MobAIContext = {
      dt,
      playerX,
      playerZ,
      playerY,
      checkCollision: checkCollisionFn,
      animTime: animTimeRef.current,
      allMobs: currentMobs,
      corePosition: gameState.corePosition,
      getBlock,
    };

    for (const mob of currentMobs) {
      const m = { ...mob };
      m.hitTimer = Math.max(0, m.hitTimer - dt);

      // ─── ニワトリ ───
      if (m.type === 'chicken') {
        const alive = updateChickenAI(m, aiCtx, chickenState.current);
        if (alive) updatedMobs.push(m);
        continue;
      }

      // ─── クモ ───
      if (m.type === 'spider') {
        const { alive, attack } = updateSpiderAI(m, aiCtx, spiderState.current);
        if (attack) {
          takeDamage(attack.damage, attack.kbDirX, attack.kbDirZ);
          playHurtSound();
        }
        if (alive) updatedMobs.push(m);
        continue;
      }

      // ─── 味方モブ（プロトタイプ / アイアンゴーレム） ───
      if (m.type === 'prototype' || m.type === 'iron_golem') {
        updateAllyMobAI(m, aiCtx, allyState.current, takeDamage);
        updatedMobs.push(m);
        continue;
      }

      // ─── 巨大ボス ───
      if (m.type === 'boss_giant') {
        const { alive, attack } = updateBossAI(m, aiCtx, bossState.current, breakBlock);
        if (attack) {
          takeDamage(attack.damage, attack.kbDirX, attack.kbDirZ);
          playHurtSound();
        }
        if (alive) updatedMobs.push(m);
        continue;
      }

      // ─── ゾンビ（デフォルト） ───
      const { alive, attack, blockAttack } = updateZombieAI(m, aiCtx, zombieState.current);
      if (attack) {
        zombieHitMob = m;
      }
      if (blockAttack) {
        const blockId = getBlock(blockAttack.x, blockAttack.y, blockAttack.z);
        if (blockId === BLOCK_IDS.CORE) {
          damageCore(blockAttack.damage);
          playHurtSound(); // TODO: コア用のダメージ音に変更
        } else {
          // コア以外の障害物ブロックは破壊する
          if (breakBlock(blockAttack.x, blockAttack.y, blockAttack.z)) {
            // ブロック破壊のエフェクト用：ここでアイテムをドロップするかパーティクルを出す
            spawnMobDeathEffect('chicken', blockAttack.x + 0.5, blockAttack.y + 0.5, blockAttack.z + 0.5); // 仮エフェクト
          }
        }
      }
      if (alive) updatedMobs.push(m);
    }

    // プレイヤーへのダメージ適用（ゾンビ）
    if (zombieHitMob) {
      const kbDirX = playerX - zombieHitMob.x;
      const kbDirZ = playerZ - zombieHitMob.z;
      takeDamage(2, kbDirX, kbDirZ);
      playHurtSound();
    }

    // setMobs前に、damageMob で同フレーム中に削除されたモブを除外
    const latestMobIds = new Set(useMobStore.getState().mobs.map((m) => m.id));
    const safeUpdatedMobs = updatedMobs.filter((m) => latestMobIds.has(m.id));

    setMobs(safeUpdatedMobs);

    // --- 死亡イベントの処理（エフェクト・サウンド・ドロップ） ---
    const deathEvents = consumeDeathEvents();
    for (const event of deathEvents) {
      spawnMobDeathEffect(event.type, event.x, event.y, event.z);

      const ddx = event.x - playerX;
      const ddz = event.z - playerZ;
      const distance = Math.sqrt(ddx * ddx + ddz * ddz);
      playMobDeathSound(distance);

      if (event.type === 'zombie' || event.type === 'spider') {
        const roll = Math.random();
        if (roll < 0.4) {
          dropItem(BLOCK_IDS.IRON, Math.floor(event.x), Math.floor(event.y), Math.floor(event.z));
        } else if (roll < 0.7) {
          dropItem(BLOCK_IDS.WOOD, Math.floor(event.x), Math.floor(event.y), Math.floor(event.z));
        } else if (roll < 0.85) {
          dropItem(BLOCK_IDS.ENCHANT, Math.floor(event.x), Math.floor(event.y), Math.floor(event.z));
        }
      }
    }

    // レンダリング用stateに同期（200msごとに制限して不要な再レンダリングを防止）
    const syncInterval = 0.2;
    if (animTimeRef.current - lastAnimSync.current >= syncInterval) {
      lastAnimSync.current = animTimeRef.current;
      setAnimTimeValue(animTimeRef.current);
    }
  });

  return (
    <group>
      {mobs.map((mob) => {
        switch (mob.type) {
          case 'zombie':
            return <Zombie key={mob.id} mob={mob} animTime={animTimeValue} />;
          case 'prototype':
            return <Prototype key={mob.id} mob={mob} animTime={animTimeValue} />;
          case 'chicken':
            return <Chicken key={mob.id} mob={mob} animTime={animTimeValue} />;
          case 'spider':
            return <Spider key={mob.id} mob={mob} animTime={animTimeValue} />;
          case 'iron_golem':
            return <IronGolem key={mob.id} mob={mob} animTime={animTimeValue} />;
          case 'boss_giant':
            return <BossRenderer key={mob.id} mob={mob} animTime={animTimeValue} />;
          default:
            return null;
        }
      })}
    </group>
  );
}
