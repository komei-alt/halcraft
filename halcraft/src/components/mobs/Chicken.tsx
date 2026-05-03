// ニワトリモブコンポーネント
// 既存AIの見た目を2026-05-01追加GLBモデルへ差し替える

import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { GlbMob, type GlbMobModelConfig } from './GlbMob';

const CHICKEN_MODEL: GlbMobModelConfig = {
  path: '/models/2026-05-01/chicken.glb',
  scale: 0.32,
  modelPosition: [0, 0.22, -0.18],
  modelRotation: [0, Math.PI, 0],
  hpBarY: 1.02,
  hpBarWidth: 0.46,
  damagedTint: new THREE.Color(0xff7777),
  bobAmount: 0.035,
  bobSpeed: 8,
};

interface ChickenProps {
  mob: MobData;
  animTime: number;
}

export function Chicken({ mob, animTime }: ChickenProps) {
  return <GlbMob mob={mob} animTime={animTime} config={CHICKEN_MODEL} />;
}
