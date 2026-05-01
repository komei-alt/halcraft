// モブの当たり判定を近接攻撃・弾道で共有する

import type { MobData, MobType } from '../stores/useMobStore';

export interface MobHitbox {
  height: number;
  radius: number;
  footOffset?: number;
}

export const MOB_HITBOXES: Record<MobType, MobHitbox> = {
  zombie: { height: 3.45, radius: 0.85 },
  darwin: { height: 3.4, radius: 1.45 },
  spider: { height: 0.7, radius: 0.75 },
  chicken: { height: 0.6, radius: 0.45 },
  prototype: { height: 3.6, radius: 0.95 },
  iron_golem: { height: 3.6, radius: 1.0 },
  boss_giant: { height: 4.8, radius: 1.45 },
};

export function getMobHitbox(type: MobData['type'] | string | undefined, fallbackRadius = 0.65): MobHitbox {
  if (type && type in MOB_HITBOXES) {
    return MOB_HITBOXES[type as MobType];
  }
  return { height: 1.8, radius: fallbackRadius };
}

export function getMobHitboxMinY(mobY: number, hitbox: MobHitbox): number {
  return mobY + (hitbox.footOffset ?? 0.05);
}

export function getMobHitboxMaxY(mobY: number, hitbox: MobHitbox): number {
  return mobY + hitbox.height;
}
