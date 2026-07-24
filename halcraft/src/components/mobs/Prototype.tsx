// プロトタイプ味方モブコンポーネント
// Nomad Sculpt 製マルチパーツ GLB にプロシージャル・リグを載せ、
// 歩行・攻撃・被ダメをハイクオリティに駆動する

import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { PROTOTYPE_ATTACK_ANIM_DURATION } from '../../utils/mobAI/constants';
import { GlbMob, type GlbMobModelConfig } from './GlbMob';

/** 最適化済みモデル（ポリゴン削減版）。元は prototype_original.glb にバックアップ */
const MODEL_PATH = '/models/prototype_optimized.glb';

const PROTOTYPE_MODEL: GlbMobModelConfig = {
  path: MODEL_PATH,
  // 原モデル Y サイズ約 7.5 → ゲーム内約 3.6
  scale: 0.48,
  modelPosition: [0, 0, 0],
  modelRotation: [0, 0, 0],
  hpBarY: 4.5,
  hpBarWidth: 1.0,
  damagedTint: new THREE.Color(0xff6666),
  angryTint: new THREE.Color(0xff6633),
  bobAmount: 0.028,
  bobSpeed: 5.5,
  rigProfile: 'prototype_arachnid',
  attackDuration: PROTOTYPE_ATTACK_ANIM_DURATION,
};

interface PrototypeProps {
  mob: MobData;
  animTime: number;
}

export function Prototype({ mob, animTime }: PrototypeProps) {
  return <GlbMob mob={mob} animTime={animTime} config={PROTOTYPE_MODEL} />;
}

useGLTF.preload(MODEL_PATH);
