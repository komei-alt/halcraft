// アイアンゴーレム味方モブコンポーネント
// SPAWNERブロックから召喚される味方キャラをGLBモデルで表示する

import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { GlbMob, type GlbMobModelConfig } from './GlbMob';

const MODEL_PATH = '/models/2026-04-29/iron-golem.glb';

const IRON_GOLEM_MODEL: GlbMobModelConfig = {
  path: MODEL_PATH,
  scale: 1.08,
  modelPosition: [0, 0.5, 0],
  modelRotation: [0, Math.PI, 0],
  hpBarY: 3.85,
  hpBarWidth: 1.25,
  damagedTint: new THREE.Color(0xff6666),
  angryTint: new THREE.Color(0xcc6666),
  bobAmount: 0.025,
  bobSpeed: 3,
};

interface IronGolemProps {
  mob: MobData;
  animTime: number;
}

export function IronGolem({ mob, animTime }: IronGolemProps) {
  return <GlbMob mob={mob} animTime={animTime} config={IRON_GOLEM_MODEL} />;
}

useGLTF.preload(MODEL_PATH);
