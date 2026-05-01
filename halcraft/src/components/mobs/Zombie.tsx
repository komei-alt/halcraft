// ゾンビモブコンポーネント
// 2026-04-29 のGLBモデルを既存AIの見た目として表示する

import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { GlbMob, type GlbMobModelConfig } from './GlbMob';

const MODEL_PATH = '/models/2026-04-29/zombie.glb';

const ZOMBIE_MODEL: GlbMobModelConfig = {
  path: MODEL_PATH,
  scale: 2.1,
  modelPosition: [0, 0.14, 0],
  modelRotation: [0, Math.PI, 0],
  hpBarY: 3.65,
  hpBarWidth: 0.7,
  damagedTint: new THREE.Color(0xff4444),
  bobAmount: 0.03,
  bobSpeed: 5,
};

interface ZombieProps {
  mob: MobData;
  animTime: number;
}

export function Zombie({ mob, animTime }: ZombieProps) {
  return <GlbMob mob={mob} animTime={animTime} config={ZOMBIE_MODEL} />;
}

useGLTF.preload(MODEL_PATH);
