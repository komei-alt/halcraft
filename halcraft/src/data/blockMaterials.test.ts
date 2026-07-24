import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEFS, BLOCK_IDS } from '../types/blocks';
import { PERFORMANCE_PROFILES } from '../utils/performance';
import { BLOCK_MATERIAL_CATALOG, getMaterialIdForFace } from './blockMaterials';
import { MATERIAL_ATLAS_SLOTS, PLANT_ATLAS_SLOTS } from '../generated/materialAtlas';
import { mapGeometryToMaterialAtlas } from '../utils/blockPbrAtlas';

const materialRoot = path.resolve('public/textures/materials');

describe('PBR material catalog', () => {
  it('全ブロック面が存在するマテリアルへ割り当てられる', () => {
    for (const definition of Object.values(BLOCK_DEFS)) {
      if (definition.id === BLOCK_IDS.AIR) continue;
      expect(definition.materialId, definition.name).toBeTruthy();
      for (const face of ['top', 'side', 'bottom'] as const) {
        const materialId = getMaterialIdForFace(definition, face);
        expect(BLOCK_MATERIAL_CATALOG[materialId], `${definition.name}:${face}`).toBeDefined();
      }
    }
    expect(Object.keys(MATERIAL_ATLAS_SLOTS).length).toBeLessThanOrEqual(64);
  });

  it('数値IDは既存通信形式のUint8範囲を維持する', () => {
    const ids = Object.values(BLOCK_IDS);
    expect(Math.max(...ids)).toBeLessThan(256);
    expect(new Set(ids).size).toBe(ids.length);
    expect([
      BLOCK_IDS.TALL_GRASS,
      BLOCK_IDS.WILDFLOWER,
      BLOCK_IDS.BUSH,
      BLOCK_IDS.REED,
      BLOCK_IDS.MUSHROOM,
      BLOCK_IDS.DEAD_BUSH,
      BLOCK_IDS.CACTUS,
      BLOCK_IDS.FROST_GRASS,
      BLOCK_IDS.NETHER_FUNGUS,
      BLOCK_IDS.ICE,
    ]).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(Array.from(Uint8Array.from(ids))).toEqual(ids);
  });

  it('必須アトラスの寸法・色空間・転送予算が正しい', async () => {
    const manifest = JSON.parse(readFileSync(path.join(materialRoot, 'manifest.json'), 'utf8')) as {
      atlasSize: number;
      cellSize: number;
      compressedBytes: number;
      colorSpaces: Record<string, string>;
    };
    expect(manifest.atlasSize).toBe(2048);
    expect(manifest.cellSize).toBe(256);
    expect(manifest.compressedBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(manifest.colorSpaces).toMatchObject({
      'block-base.webp': 'srgb',
      'block-normal.webp': 'linear',
      'block-orm.webp': 'linear-r-ao-g-roughness-b-metalness',
      'block-emissive.webp': 'srgb-emissive',
      'plants.webp': 'srgb-alpha-cutout',
    });

    for (const file of ['block-base.webp', 'block-normal.webp', 'block-orm.webp', 'block-emissive.webp']) {
      const metadata = await sharp(path.join(materialRoot, file)).metadata();
      expect([metadata.width, metadata.height], file).toEqual([2048, 2048]);
    }
    const plantMetadata = await sharp(path.join(materialRoot, 'plants.webp')).metadata();
    expect([plantMetadata.width, plantMetadata.height]).toEqual([1024, 1024]);
    expect(Object.keys(PLANT_ATLAS_SLOTS)).toHaveLength(9);
  });

  it('展開後GPUテクスチャ予算をHigh 96MB・Low 24MB以内に保つ', () => {
    const rgba2048Bytes = 2048 * 2048 * 4;
    const rgba1024Bytes = 1024 * 1024 * 4;
    const highBytes = rgba2048Bytes * 4 + rgba1024Bytes;
    const lowBytes = rgba2048Bytes + rgba1024Bytes;
    expect(highBytes).toBeLessThanOrEqual(96 * 1024 * 1024);
    expect(lowBytes).toBeLessThanOrEqual(24 * 1024 * 1024);
    expect(PERFORMANCE_PROFILES.low.materialDetail).toBe('base');
  });

  it('特殊ブロック形状のUVを共通PBRアトラスへ写せる', () => {
    const geometry = mapGeometryToMaterialAtlas(new THREE.PlaneGeometry(1, 1), 'wood_planks');
    const uv = geometry.getAttribute('uv');
    const slot = MATERIAL_ATLAS_SLOTS.wood_planks;
    for (let index = 0; index < uv.count; index++) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(slot.u0);
      expect(uv.getX(index)).toBeLessThanOrEqual(slot.u1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(slot.v0);
      expect(uv.getY(index)).toBeLessThanOrEqual(slot.v1);
    }
    expect(geometry.getAttribute('uv1').count).toBe(uv.count);
    geometry.dispose();
  });

  it('新規ブロックIDをマルチプレイヤーの数値JSON形式で往復できる', () => {
    const changes = [
      BLOCK_IDS.TALL_GRASS,
      BLOCK_IDS.WILDFLOWER,
      BLOCK_IDS.BUSH,
      BLOCK_IDS.REED,
      BLOCK_IDS.MUSHROOM,
      BLOCK_IDS.DEAD_BUSH,
      BLOCK_IDS.CACTUS,
      BLOCK_IDS.FROST_GRASS,
      BLOCK_IDS.NETHER_FUNGUS,
      BLOCK_IDS.ICE,
    ].map((blockId, index) => ({ x: index, y: 20, z: -(index + 1), blockId }));
    const roundTrip = JSON.parse(JSON.stringify({ changes })) as { changes: typeof changes };
    expect(roundTrip.changes).toEqual(changes);
    expect(Array.from(Uint8Array.from(roundTrip.changes.map((change) => change.blockId))))
      .toEqual(changes.map((change) => change.blockId));
  });
});
