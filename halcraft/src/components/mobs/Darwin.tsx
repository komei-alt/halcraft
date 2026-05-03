// ダーウィン敵モブコンポーネント
// 夜に出現する強めの敵キャラ

import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { GlbMob, type GlbMobModelConfig } from './GlbMob';

const MODEL_PATH = '/models/2026-04-29/darwin.glb';

const DARWIN_MODEL: GlbMobModelConfig = {
  path: MODEL_PATH,
  scale: 0.24,
  modelPosition: [0, 0.35, 0],
  modelRotation: [0, Math.PI, 0],
  hpBarY: 3.55,
  hpBarWidth: 1.25,
  damagedTint: new THREE.Color(0xff4444),
  bobAmount: 0.04,
  bobSpeed: 4.5,
};

interface DarwinProps {
  mob: MobData;
  animTime: number;
}

export function Darwin({ mob, animTime }: DarwinProps) {
  return <GlbMob mob={mob} animTime={animTime} config={DARWIN_MODEL} />;
}

useGLTF.preload(MODEL_PATH);
