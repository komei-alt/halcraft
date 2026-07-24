// 開発専用モブ・リグ検証ラボ（?rigLab=1）。
// 7種類を同じ照明と地形に並べ、速度・旋回・攻撃・被ダメ・位相・LODを比較する。

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { PCFShadowMap } from 'three';
import { BLOCK_IDS, type BlockId } from '../../types/blocks';
import { useWorldStore } from '../../stores/useWorldStore';
import { useMobStore, type MobData, type MobType } from '../../stores/useMobStore';
import { Prototype } from './Prototype';
import { Spider } from './Spider';
import { Zombie } from './Zombie';
import { Darwin } from './Darwin';
import { Chicken } from './Chicken';
import { IronGolem } from './IronGolem';
import { BossRenderer } from './BossRenderer';
import './RigLab.css';

type RigLabAction = 'idle' | 'walk' | 'turn' | 'attack' | 'hit';
type RigLabTerrain = 'flat' | 'steps';
type RigLabLod = 'near' | 'mid' | 'far';

interface RigLabSettings {
  action: RigLabAction;
  speed: number;
  turnRate: number;
  terrain: RigLabTerrain;
  phase: number;
  lod: RigLabLod;
}

interface LabMob extends MobData {
  labBaseX: number;
  labBaseZ: number;
}

const LAB_MOB_LAYOUT: ReadonlyArray<{
  type: MobType;
  label: string;
  x: number;
  hp: number;
  ally: boolean;
}> = [
  { type: 'prototype', label: 'プロトタイプ', x: -8.4, hp: 280, ally: true },
  { type: 'spider', label: 'クモ', x: -5.2, hp: 8, ally: false },
  { type: 'zombie', label: 'ゾンビ', x: -3.1, hp: 10, ally: false },
  { type: 'darwin', label: 'ダーウィン', x: -0.8, hp: 24, ally: false },
  { type: 'chicken', label: 'ニワトリ', x: 1.7, hp: 4, ally: false },
  { type: 'iron_golem', label: 'ゴーレム', x: 4.1, hp: 40, ally: true },
  { type: 'boss_giant', label: 'ボス', x: 7.4, hp: 500, ally: false },
];

const CAMERA_Z_BY_LOD: Readonly<Record<RigLabLod, number>> = {
  near: 17,
  mid: 28,
  far: 43,
};

function surfaceYAt(x: number, z: number, terrain: RigLabTerrain): number {
  if (terrain === 'flat') return 0;
  const step = ((Math.floor((x + 12) / 2.4) % 3) + 3) % 3;
  const ridge = Math.abs(z) > 2.8 ? 1 : 0;
  return Math.min(2, step + ridge);
}

function createLabMob(
  type: MobType,
  x: number,
  hp: number,
  ally: boolean,
  phase: number,
): LabMob {
  return {
    id: `rig-lab-${type}-${phase.toFixed(2)}`,
    type,
    x,
    y: 0,
    z: 0,
    hp,
    maxHp: hp,
    vx: 0,
    vy: 0,
    vz: 0,
    rotation: 0,
    hitTimer: 0,
    hitDirX: 0,
    hitDirZ: 1,
    attackTimer: 0,
    burnTimer: 0,
    isAlly: ally,
    angryAtPlayer: false,
    angryTimer: 0,
    traitAccent: ally ? '#6de2ff' : '#ff745f',
    bossEncounterId: type === 'boss_giant' ? 'forest_guardian' : undefined,
    labBaseX: x,
    labBaseZ: 0,
  };
}

function RigLabCamera({ lod }: { lod: RigLabLod }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 6.4, CAMERA_Z_BY_LOD[lod]);
    camera.lookAt(0, 1.7, 0);
    camera.updateProjectionMatrix();
  }, [camera, lod]);
  return null;
}

function RigLabGround({ terrain }: { terrain: RigLabTerrain }) {
  const columns = useMemo(() => {
    const result: Array<{ x: number; height: number }> = [];
    for (let x = -13; x <= 13; x++) {
      result.push({ x, height: surfaceYAt(x, 0, terrain) });
    }
    return result;
  }, [terrain]);

  return (
    <group>
      {columns.map(({ x, height }) => (
        <mesh key={x} position={[x + 0.5, (height - 0.12) / 2, 0]} receiveShadow>
          <boxGeometry args={[1.02, Math.max(0.12, height + 0.12), 9]} />
          <meshStandardMaterial
            color={terrain === 'steps' ? (height % 2 === 0 ? '#31493e' : '#3f5747') : '#354b40'}
            roughness={0.92}
          />
        </mesh>
      ))}
      <gridHelper args={[28, 28, '#7de7d2', '#49675e']} position={[0, 0.012, 0]} />
    </group>
  );
}

function RigLabMob({ mob, phase }: { mob: LabMob; phase: number }) {
  const animTime = phase * 10;
  switch (mob.type) {
    case 'prototype': return <Prototype mob={mob} animTime={animTime} />;
    case 'spider': return <Spider mob={mob} animTime={animTime} />;
    case 'zombie': return <Zombie mob={mob} animTime={animTime} />;
    case 'darwin': return <Darwin mob={mob} animTime={animTime} />;
    case 'chicken': return <Chicken mob={mob} animTime={animTime} />;
    case 'iron_golem': return <IronGolem mob={mob} animTime={animTime} />;
    case 'boss_giant': return <BossRenderer mob={mob} animTime={animTime} />;
  }
}

function RigLabActors({ settings }: { settings: RigLabSettings }) {
  const settingsRef = useRef(settings);
  const clockRef = useRef(0);
  const mobs = useMemo(
    () => LAB_MOB_LAYOUT.map(({ type, x, hp, ally }) => createLabMob(type, x, hp, ally, settings.phase)),
    [settings.phase],
  );

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const originalGetBlock = useWorldStore.getState().getBlock;
    const originalMobs = useMobStore.getState().mobs;
    const labGetBlock = (x: number, y: number, z: number): BlockId => (
      y < surfaceYAt(x, z, settingsRef.current.terrain)
        ? BLOCK_IDS.STONE
        : BLOCK_IDS.AIR
    );
    useWorldStore.setState({ getBlock: labGetBlock });
    useMobStore.setState({ mobs });
    return () => {
      useWorldStore.setState({ getBlock: originalGetBlock });
      useMobStore.setState({ mobs: originalMobs });
    };
  }, [mobs]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    clockRef.current += dt;
    const time = clockRef.current;
    const current = settingsRef.current;
    const walking = current.action === 'walk';
    const turning = current.action === 'turn';
    const attacking = current.action === 'attack';
    const hit = current.action === 'hit';

    const liveMobs = useMobStore.getState().mobs as LabMob[];
    const updatedMobs: LabMob[] = [];
    for (let index = 0; index < liveMobs.length; index++) {
      const mob = { ...liveMobs[index] };
      const localPhase = time + index * 0.17 + current.phase;
      if (turning) mob.rotation += current.turnRate * dt;
      else mob.rotation = Math.sin(localPhase * 0.32) * 0.08;

      const speed = walking ? current.speed : turning ? 0.08 : 0;
      mob.vx = Math.sin(mob.rotation) * speed;
      mob.vz = Math.cos(mob.rotation) * speed;
      mob.x = mob.labBaseX + (walking ? Math.sin(localPhase * Math.max(0.2, current.speed) * 0.45) * 0.36 : 0);
      mob.z = mob.labBaseZ + (walking ? Math.cos(localPhase * Math.max(0.2, current.speed) * 0.45) * 0.16 : 0);
      mob.y = surfaceYAt(mob.x, mob.z, current.terrain);

      const attackDuration = mob.type === 'boss_giant' ? 0.72 : mob.type === 'spider' ? 0.4 : 0.52;
      const attackCycle = localPhase % 1.55;
      mob.attackTimer = attacking && attackCycle < attackDuration
        ? attackDuration - attackCycle
        : 0;
      const hitCycle = localPhase % 1.2;
      mob.hitTimer = hit && hitCycle < 0.34 ? 0.34 - hitCycle : 0;
      mob.hitDirX = Math.sin(localPhase * 1.7);
      mob.hitDirZ = Math.cos(localPhase * 1.7);
      updatedMobs.push(mob);
    }
    useMobStore.setState({ mobs: updatedMobs });
  });

  return (
    <>
      {mobs.map((mob) => (
        <RigLabMob key={mob.id} mob={mob} phase={settings.phase} />
      ))}
    </>
  );
}

function RigLabScene({ settings }: { settings: RigLabSettings }) {
  return (
    <Canvas
      shadows={{ type: PCFShadowMap }}
      camera={{ position: [0, 6.4, CAMERA_Z_BY_LOD[settings.lod]], fov: 48, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#101a20']} />
      <fog attach="fog" args={['#101a20', 24, 62]} />
      <ambientLight intensity={1.05} />
      <hemisphereLight args={['#b9e6ff', '#2b251d', 1.4]} />
      <directionalLight
        position={[7, 13, 9]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-4}
      />
      <RigLabCamera lod={settings.lod} />
      <Suspense fallback={null}>
        <RigLabGround terrain={settings.terrain} />
        <RigLabActors key={settings.phase.toFixed(2)} settings={settings} />
      </Suspense>
      <OrbitControls target={[0, 1.7, 0]} minDistance={8} maxDistance={55} maxPolarAngle={Math.PI * 0.49} />
    </Canvas>
  );
}

const ACTION_LABELS: ReadonlyArray<{ value: RigLabAction; label: string }> = [
  { value: 'idle', label: '待機' },
  { value: 'walk', label: '歩行' },
  { value: 'turn', label: '旋回' },
  { value: 'attack', label: '攻撃' },
  { value: 'hit', label: '被弾' },
];

export default function RigLab() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [settings, setSettings] = useState<RigLabSettings>({
    action: 'walk',
    speed: 2.4,
    turnRate: 0.8,
    terrain: 'flat',
    phase: 0,
    lod: 'near',
  });

  const updateSetting = <K extends keyof RigLabSettings>(key: K, value: RigLabSettings[K]): void => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="rig-lab">
      <div className="rig-lab__canvas">
        <RigLabScene settings={settings} />
      </div>
      <button
        type="button"
        className="rig-lab__panel-toggle"
        onClick={() => setPanelOpen((open) => !open)}
      >
        {panelOpen ? 'UIを隠す' : 'UIを表示'}
      </button>
      {panelOpen ? <aside className="rig-lab__panel" aria-label="リグ検証コントロール">
        <p className="rig-lab__eyebrow">HALCRAFT / DEV TOOL</p>
        <h1>Mob Rig Lab</h1>
        <p className="rig-lab__description">7体の接地、足滑り、旋回、攻撃ブレンドを同じ条件で比較します。</p>

        <div className="rig-lab__actions" role="group" aria-label="動作">
          {ACTION_LABELS.map((action) => (
            <button
              key={action.value}
              type="button"
              className={settings.action === action.value ? 'is-active' : undefined}
              onClick={() => updateSetting('action', action.value)}
            >
              {action.label}
            </button>
          ))}
        </div>

        <label>
          <span>移動速度 <strong>{settings.speed.toFixed(1)}</strong></span>
          <input
            type="range"
            min="0.4"
            max="4.4"
            step="0.1"
            value={settings.speed}
            onChange={(event) => updateSetting('speed', Number(event.target.value))}
          />
        </label>
        <label>
          <span>旋回速度 <strong>{settings.turnRate.toFixed(1)}</strong></span>
          <input
            type="range"
            min="-2"
            max="2"
            step="0.1"
            value={settings.turnRate}
            onChange={(event) => updateSetting('turnRate', Number(event.target.value))}
          />
        </label>
        <label>
          <span>初期位相 <strong>{settings.phase.toFixed(2)}</strong></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.phase}
            onChange={(event) => updateSetting('phase', Number(event.target.value))}
          />
        </label>

        <div className="rig-lab__selects">
          <label>
            <span>地形</span>
            <select value={settings.terrain} onChange={(event) => updateSetting('terrain', event.target.value as RigLabTerrain)}>
              <option value="flat">フラット</option>
              <option value="steps">段差</option>
            </select>
          </label>
          <label>
            <span>LOD距離</span>
            <select value={settings.lod} onChange={(event) => updateSetting('lod', event.target.value as RigLabLod)}>
              <option value="near">近距離</option>
              <option value="mid">中距離</option>
              <option value="far">遠距離</option>
            </select>
          </label>
        </div>

        <ol className="rig-lab__legend">
          {LAB_MOB_LAYOUT.map((mob) => <li key={mob.type}>{mob.label}</li>)}
        </ol>
        <p className="rig-lab__hint">ドラッグで回転 / ホイールでズーム</p>
      </aside> : null}
    </main>
  );
}
