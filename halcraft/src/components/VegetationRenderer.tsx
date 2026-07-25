import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE } from '../types/blocks';
import { getPerformanceProfile } from '../utils/performance';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useWorldStore, type IndexedBlockPosition } from '../stores/useWorldStore';
import { VEGETATION_BLOCK_IDS, getPlantAtlasId } from '../data/blockMaterials';
import { MATERIAL_ATLAS_SLOTS, PLANT_ATLAS_SLOTS, type PlantAtlasId } from '../generated/materialAtlas';

interface PlantInstance extends IndexedBlockPosition {
  atlasId: PlantAtlasId;
  scale: number;
  rotation: number;
}

interface VegetationShader extends THREE.WebGLProgramParametersWithUniforms {
  uniforms: THREE.WebGLProgramParametersWithUniforms['uniforms'] & {
    uPlantTime: { value: number };
    uPlantWind: { value: number };
    uPlantNear: { value: number };
    uPlantFar: { value: number };
    uPlantCards: { value: number };
  };
}

const PLANT_TEXTURE_URL = '/textures/materials/plants.webp';
const BLOCK_ATLAS_URLS = [
  '/textures/materials/block-base.webp',
  '/textures/materials/block-normal.webp',
  '/textures/materials/block-orm.webp',
] as const;
const CAMERA_CHUNK_UPDATE_MS = 280;

function hashUnit(x: number, y: number, z: number, salt: number): number {
  let hash = Math.imul(x | 0, 0x45d9f3b)
    ^ Math.imul(y | 0, 0x119de1f3)
    ^ Math.imul(z | 0, 0x3449f5)
    ^ Math.imul(salt | 0, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function createCrossCardGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const cardIndices: number[] = [];
  const indices: number[] = [];
  const width = 1.08;
  const height = 1.18;

  for (let card = 0; card < 3; card++) {
    const angle = card * Math.PI / 3;
    const dx = Math.cos(angle) * width * 0.5;
    const dz = Math.sin(angle) * width * 0.5;
    const base = positions.length / 3;
    positions.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    const nx = -Math.sin(angle);
    const nz = Math.cos(angle);
    for (let vertex = 0; vertex < 4; vertex++) normals.push(nx, 0, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    cardIndices.push(card, card, card, card);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('cardIndex', new THREE.Float32BufferAttribute(cardIndices, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createPlantMaterial(
  map: THREE.Texture,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.34,
    side: THREE.DoubleSide,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.76,
    depthWrite: true,
  });
  material.name = 'HalCraft Instanced Vegetation PBR';
  material.onBeforeCompile = (shader) => {
    const vegetationShader = shader as VegetationShader;
    vegetationShader.uniforms.uPlantTime = { value: 0 };
    vegetationShader.uniforms.uPlantWind = { value: 0 };
    vegetationShader.uniforms.uPlantNear = { value: 36 };
    vegetationShader.uniforms.uPlantFar = { value: 92 };
    vegetationShader.uniforms.uPlantCards = { value: 3 };
    vegetationShader.vertexShader = vegetationShader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 instanceAtlas;
attribute float instanceSeed;
attribute float cardIndex;
uniform float uPlantTime;
uniform float uPlantWind;
uniform float uPlantNear;
uniform float uPlantFar;
uniform float uPlantCards;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = instanceAtlas.xy + vMapUv * instanceAtlas.zw;
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
vec3 plantWorldOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float plantDistance = distance(cameraPosition, plantWorldOrigin);
float activeCards = uPlantCards;
if (uPlantCards > 2.5 && plantDistance > uPlantNear) activeCards = 2.0;
if (plantDistance > uPlantFar) activeCards = 1.0;
if (cardIndex + 0.5 > activeCards) transformed = vec3(0.0);
float windMask = smoothstep(0.18, 1.0, position.y) * (1.0 - smoothstep(28.0, 52.0, plantDistance));
float windPhase = uPlantTime * 1.35 + plantWorldOrigin.x * 0.17 + plantWorldOrigin.z * 0.13 + instanceSeed * 6.2831;
transformed.x += sin(windPhase) * 0.045 * uPlantWind * windMask;
transformed.z += cos(windPhase * 0.83) * 0.025 * uPlantWind * windMask;`,
      );
    material.userData.vegetationShader = vegetationShader;
  };
  material.customProgramCacheKey = () => 'halcraft-vegetation-pbr-v1';
  return material;
}

function remapGeometryUv(geometry: THREE.BufferGeometry, slot: typeof MATERIAL_ATLAS_SLOTS.cactus): void {
  const source = geometry.getAttribute('uv');
  const mapped = new Float32Array(source.count * 2);
  for (let index = 0; index < source.count; index++) {
    mapped[index * 2] = slot.u0 + source.getX(index) * (slot.u1 - slot.u0);
    mapped[index * 2 + 1] = slot.v0 + source.getY(index) * (slot.v1 - slot.v0);
  }
  const attribute = new THREE.BufferAttribute(mapped, 2);
  geometry.setAttribute('uv', attribute);
  geometry.setAttribute('uv1', attribute.clone());
  geometry.setAttribute('uv2', attribute.clone());
}

function getVisibleInstances(
  cameraChunk: { cx: number; cz: number },
  density: number,
  radius: number,
): { plants: PlantInstance[]; cactus: IndexedBlockPosition[] } {
  const state = useWorldStore.getState();
  const plants: PlantInstance[] = [];
  const cactus: IndexedBlockPosition[] = [];

  for (const blockId of VEGETATION_BLOCK_IDS) {
    const atlasId = getPlantAtlasId(blockId);
    if (!atlasId) continue;
    for (const position of state.getIndexedBlockPositions(blockId)) {
      const cx = Math.floor(position.x / CHUNK_SIZE);
      const cz = Math.floor(position.z / CHUNK_SIZE);
      if (Math.max(Math.abs(cx - cameraChunk.cx), Math.abs(cz - cameraChunk.cz)) > radius) continue;
      const seed = hashUnit(position.x, position.y, position.z, blockId);
      if (seed > density) continue;
      plants.push({
        ...position,
        atlasId,
        rotation: seed * Math.PI * 2,
        scale: 0.82 + hashUnit(position.z, position.x, position.y, blockId + 91) * 0.34,
      });
    }
  }

  for (const position of state.getIndexedBlockPositions(BLOCK_IDS.CACTUS)) {
    const cx = Math.floor(position.x / CHUNK_SIZE);
    const cz = Math.floor(position.z / CHUNK_SIZE);
    if (Math.max(Math.abs(cx - cameraChunk.cx), Math.abs(cz - cameraChunk.cz)) > radius) continue;
    cactus.push(position);
    if (state.getBlock(position.x, position.y + 1, position.z) !== BLOCK_IDS.CACTUS) {
      const seed = hashUnit(position.x, position.y, position.z, BLOCK_IDS.CACTUS);
      plants.push({
        ...position,
        y: position.y + 0.88,
        atlasId: 'cactus_blossom',
        rotation: seed * Math.PI * 2,
        scale: 0.68 + seed * 0.16,
      });
    }
  }

  return { plants, cactus };
}

/**
 * 植物を全種まとめて描く専用レンダラー。
 * Reactノード数は配置数に依存せず、植物カード1ドロー＋サボテン1ドローに固定する。
 */
export function VegetationRenderer() {
  const plantTexture = useLoader(THREE.TextureLoader, PLANT_TEXTURE_URL);
  const blockTextures = useLoader(THREE.TextureLoader, [...BLOCK_ATLAS_URLS]);
  const { camera, gl } = useThree();
  const blockIndexVersion = useWorldStore((state) => state.blockIndexVersion);
  useSettingsStore((state) => state.graphicsPreset);
  useSettingsStore((state) => state.renderDistance);
  useSettingsStore((state) => state.shadowQuality);
  const profile = getPerformanceProfile();
  const [cameraChunk, setCameraChunk] = useState({ cx: 0, cz: 0 });
  const lastCameraUpdate = useRef(0);
  const plantMesh = useRef<THREE.InstancedMesh>(null);
  const cactusMesh = useRef<THREE.InstancedMesh>(null);

  const plantMap = useMemo(() => {
    const texture = plantTexture.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }, [gl, plantTexture]);

  const visible = useMemo(() => {
    void blockIndexVersion;
    return getVisibleInstances(cameraChunk, profile.vegetationDensity, profile.vegetationChunkRadius);
  }, [blockIndexVersion, cameraChunk, profile.vegetationChunkRadius, profile.vegetationDensity]);

  const plantGeometry = useMemo(() => {
    const geometry = createCrossCardGeometry();
    const atlas = new Float32Array(visible.plants.length * 4);
    const seeds = new Float32Array(visible.plants.length);
    visible.plants.forEach((plant, index) => {
      const slot = PLANT_ATLAS_SLOTS[plant.atlasId];
      atlas.set([slot.u0, slot.v0, slot.u1 - slot.u0, slot.v1 - slot.v0], index * 4);
      seeds[index] = hashUnit(plant.x, plant.y, plant.z, plant.blockId);
    });
    geometry.setAttribute('instanceAtlas', new THREE.InstancedBufferAttribute(atlas, 4));
    geometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    return geometry;
  }, [visible.plants]);
  const plantMaterial = useMemo(
    () => createPlantMaterial(plantMap),
    [plantMap],
  );

  const cactusGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(0.76, 0.96, 0.76, 1, 2, 1);
    remapGeometryUv(geometry, MATERIAL_ATLAS_SLOTS.cactus);
    return geometry;
  }, []);
  const cactusMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: blockTextures[0],
    normalMap: profile.materialDetail === 'pbr' ? blockTextures[1] : null,
    normalScale: new THREE.Vector2(0.65, 0.65),
    aoMap: profile.materialDetail === 'pbr' ? blockTextures[2] : null,
    roughnessMap: profile.materialDetail === 'pbr' ? blockTextures[2] : null,
    metalnessMap: profile.materialDetail === 'pbr' ? blockTextures[2] : null,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.7,
  }), [blockTextures, profile.materialDetail]);

  useLayoutEffect(() => {
    const mesh = plantMesh.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    visible.plants.forEach((plant, index) => {
      dummy.position.set(plant.x + 0.5, plant.y + 0.015, plant.z + 0.5);
      dummy.rotation.set(0, plant.rotation, 0);
      dummy.scale.setScalar(plant.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = visible.plants.length;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
  }, [visible.plants]);

  useLayoutEffect(() => {
    const mesh = cactusMesh.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    visible.cactus.forEach((plant, index) => {
      const variation = hashUnit(plant.x, plant.y, plant.z, BLOCK_IDS.CACTUS);
      dummy.position.set(plant.x + 0.5, plant.y + 0.49, plant.z + 0.5);
      dummy.rotation.set(0, variation * Math.PI * 0.08, 0);
      dummy.scale.set(0.92 + variation * 0.12, 1, 0.92 + variation * 0.12);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.count = visible.cactus.length;
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
  }, [visible.cactus]);

  useEffect(() => {
    gl.domElement.setAttribute('data-vegetation-renderer', 'instanced-lod-v1');
    gl.domElement.setAttribute('data-vegetation-draw-calls', '2');
    gl.domElement.setAttribute('data-vegetation-density', String(profile.vegetationDensity));
    gl.domElement.setAttribute('data-vegetation-instances', String(visible.plants.length + visible.cactus.length));
  }, [gl, profile.vegetationDensity, visible.cactus.length, visible.plants.length]);

  useEffect(() => () => {
    plantGeometry.dispose();
  }, [plantGeometry]);
  useEffect(() => () => {
    plantMaterial.dispose();
  }, [plantMaterial]);
  useEffect(() => () => plantMap.dispose(), [plantMap]);
  useEffect(() => () => {
    cactusGeometry.dispose();
  }, [cactusGeometry]);
  useEffect(() => () => {
    cactusMaterial.dispose();
  }, [cactusMaterial]);

  // GPU uniformとカメラ追従はR3Fフレームループで更新する意図した副作用。

  useFrame((_, delta) => {
    const now = performance.now();
    if (now - lastCameraUpdate.current >= CAMERA_CHUNK_UPDATE_MS) {
      lastCameraUpdate.current = now;
      const nextCx = Math.floor(camera.position.x / CHUNK_SIZE);
      const nextCz = Math.floor(camera.position.z / CHUNK_SIZE);
      setCameraChunk((current) => (
        current.cx === nextCx && current.cz === nextCz ? current : { cx: nextCx, cz: nextCz }
      ));
    }
    const shader = plantMaterial.userData.vegetationShader as VegetationShader | undefined;
    if (!shader) return;
    shader.uniforms.uPlantTime.value += delta;
    shader.uniforms.uPlantWind.value = profile.vegetationWind;
    shader.uniforms.uPlantCards.value = profile.vegetationLodDistances.length;
    shader.uniforms.uPlantNear.value = profile.vegetationLodDistances[0] ?? 36;
    shader.uniforms.uPlantFar.value = profile.vegetationLodDistances[1]
      ?? profile.vegetationLodDistances[0]
      ?? 80;
  });


  return (
    <group name="halcraft-instanced-vegetation">
      {visible.plants.length > 0 && (
        <instancedMesh
          key={`plants-${visible.plants.length}`}
          ref={plantMesh}
          args={[plantGeometry, plantMaterial, visible.plants.length]}
          castShadow={profile.vegetationShadows}
          receiveShadow
          frustumCulled={false}
        />
      )}
      {visible.cactus.length > 0 && (
        <instancedMesh
          key={`cactus-${visible.cactus.length}`}
          ref={cactusMesh}
          args={[cactusGeometry, cactusMaterial, visible.cactus.length]}
          castShadow={profile.vegetationShadows}
          receiveShadow
          frustumCulled={false}
        />
      )}
    </group>
  );
}
