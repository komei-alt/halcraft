import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLOCK_IDS } from '../types/blocks';
import {
  MOB_RIG_PROFILES,
  advanceLocomotionPhase,
  createFootPlantState,
  createLocomotionPhaseState,
  sampleGait,
  sampleRigSurfaceY,
  setSegmentTransform,
  solveTwoBoneIK,
  updatePlantedFoot,
} from './mobRigMotion';

describe('mobRigMotion', () => {
  it('歩行位相はフレームレートではなく移動距離で一致する', () => {
    const profile = MOB_RIG_PROFILES.zombie;
    const at60Fps = createLocomotionPhaseState();
    const at30Fps = createLocomotionPhaseState();

    for (let frame = 0; frame < 60; frame++) {
      advanceLocomotionPhase(at60Fps, {
        speed: 1.7,
        delta: 1 / 60,
        rotation: 0,
        moving: true,
        profile,
      });
    }
    for (let frame = 0; frame < 30; frame++) {
      advanceLocomotionPhase(at30Fps, {
        speed: 1.7,
        delta: 1 / 30,
        rotation: 0,
        moving: true,
        profile,
      });
    }

    expect(at60Fps.phase).toBeCloseTo(at30Fps.phase, 6);
  });

  it('交互歩容では同時に全脚を持ち上げない', () => {
    const profile = MOB_RIG_PROFILES.spider;
    const firstTetrapod = sampleGait(0.4, 0, profile);
    const secondTetrapod = sampleGait(0.4, 0.5, profile);

    expect(firstTetrapod.swinging).toBe(false);
    expect(secondTetrapod.swinging).toBe(true);
    expect(firstTetrapod.plantedWeight).toBeGreaterThan(0.9);
    expect(secondTetrapod.lift).toBeGreaterThan(0);
  });

  it('スタンス中は足のXZを固定し、スイングだけ次の接地点へ運ぶ', () => {
    const profile = MOB_RIG_PROFILES.spider;
    const state = createFootPlantState();
    const origin = new THREE.Vector3(0, 0, 0);
    const next = new THREE.Vector3(1, 0, 0);

    updatePlantedFoot(state, {
      gait: sampleGait(0.1, 0, profile),
      restWorld: origin,
      nextWorld: next,
      groundY: 0,
      lift: profile.footLift,
      moving: true,
      delta: 1 / 60,
    });
    const movedRest = new THREE.Vector3(0.5, 0, 0);
    updatePlantedFoot(state, {
      gait: sampleGait(0.3, 0, profile),
      restWorld: movedRest,
      nextWorld: next,
      groundY: 0,
      lift: profile.footLift,
      moving: true,
      delta: 1 / 60,
    });
    expect(state.position.x).toBeCloseTo(0, 6);

    updatePlantedFoot(state, {
      gait: sampleGait(0.99, 0, profile),
      restWorld: movedRest,
      nextWorld: next,
      groundY: 0,
      lift: profile.footLift,
      moving: true,
      delta: 1 / 60,
    });
    expect(state.position.x).toBeGreaterThan(0.98);
  });

  it('2ボーンIKは両セグメント長を保って到達点を解く', () => {
    const hip = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(0.2, -1.5, 0.15);
    const result = {
      knee: new THREE.Vector3(),
      foot: new THREE.Vector3(),
      stretch: 0,
    };

    solveTwoBoneIK(hip, target, new THREE.Vector3(1, 0.2, 0), 1, 0.8, result);

    expect(hip.distanceTo(result.knee)).toBeCloseTo(1, 5);
    expect(result.knee.distanceTo(result.foot)).toBeCloseTo(0.8, 5);
    expect(result.foot.distanceTo(target)).toBeLessThan(1e-5);
  });

  it('足元プローブは最寄りの固体上面を返す', () => {
    const getBlock = (x: number, y: number, z: number) => {
      void x;
      void z;
      return y < 2 ? BLOCK_IDS.STONE : BLOCK_IDS.AIR;
    };
    expect(sampleRigSurfaceY(getBlock, 0.2, 0.2, 2, 0.75)).toBe(2);
  });

  it('セグメント行列は2点の中点と長さへ一致する', () => {
    const segment = new THREE.Object3D();
    setSegmentTransform(
      segment,
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(2, 0, 0),
      0.1,
    );
    expect(segment.position.x).toBeCloseTo(0.5, 6);
    expect(segment.scale.x).toBeCloseTo(3, 6);
    expect(segment.scale.y).toBeCloseTo(0.1, 6);
  });
});
