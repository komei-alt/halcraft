import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MATERIAL_SOURCES, PLANT_SOURCES } from './material-source-defs.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'material-sources');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'public', 'textures', 'materials');
const ICON_DIR = path.join(PROJECT_ROOT, 'public', 'textures', 'material-icons');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'src', 'generated');

const ATLAS_SIZE = 2048;
const CELL_SIZE = 256;
const PADDING = 6;
const CONTENT_SIZE = CELL_SIZE - PADDING * 2;
const PLANT_ATLAS_SIZE = 1024;
const PLANT_CELL_SIZE = 256;
const PLANT_CONTENT_SIZE = 220;

const TERRAIN_SHEET = path.join(SOURCE_DIR, 'terrain-material-sheet.png');
const SPECIAL_SHEET = path.join(SOURCE_DIR, 'special-material-sheet.png');
const PLANT_SHEET = path.join(SOURCE_DIR, 'vegetation-production-sheet.png');

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isKeyMagenta(red, green, blue) {
  return red >= 220 && blue >= 220 && green <= 82;
}

function contiguousRuns(flags, minimumLength) {
  const runs = [];
  let start = -1;
  for (let index = 0; index <= flags.length; index++) {
    if (index < flags.length && flags[index]) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0 && index - start >= minimumLength) {
      runs.push({ start, end: index, length: index - start });
    }
    start = -1;
  }
  return runs;
}

async function detectMaterialGrid(sheetPath) {
  const { data, info } = await sharp(sheetPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const columnContent = Array.from({ length: width }, (_, x) => {
    let keyed = 0;
    let samples = 0;
    for (let y = 0; y < height; y += 4) {
      const offset = (y * width + x) * channels;
      if (isKeyMagenta(data[offset], data[offset + 1], data[offset + 2])) keyed++;
      samples++;
    }
    return keyed / samples < 0.82;
  });
  const rowContent = Array.from({ length: height }, (_, y) => {
    let keyed = 0;
    let samples = 0;
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * channels;
      if (isKeyMagenta(data[offset], data[offset + 1], data[offset + 2])) keyed++;
      samples++;
    }
    return keyed / samples < 0.82;
  });

  const columns = contiguousRuns(columnContent, Math.floor(width * 0.12));
  const rows = contiguousRuns(rowContent, Math.floor(height * 0.12));
  if (columns.length !== 4 || rows.length !== 4) {
    throw new Error(`素材シートの4x4グリッドを検出できません: ${sheetPath}`);
  }

  const tiles = [];
  for (const row of rows) {
    for (const column of columns) {
      // 生成シートのマゼンタ境界には数pxのアンチエイリアスがあるため、
      // セル検出後に内側へ少し入ってから正方形へ正規化する。
      const inset = Math.max(5, Math.round(Math.min(column.length, row.length) * 0.025));
      const tile = await sharp(sheetPath)
        .extract({
          left: column.start + inset,
          top: row.start + inset,
          width: column.length - inset * 2,
          height: row.length - inset * 2,
        })
        .resize(CONTENT_SIZE, CONTENT_SIZE, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
        .ensureAlpha()
        .png()
        .toBuffer();
      tiles.push(tile);
    }
  }
  return tiles;
}

async function makeStripComposite(base, cap, capHeight) {
  const strip = await sharp(cap)
    .extract({ left: 0, top: 0, width: CONTENT_SIZE, height: capHeight })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{ input: strip, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function makeFarmlandTile(dirt) {
  const grooves = Buffer.from(`
    <svg width="${CONTENT_SIZE}" height="${CONTENT_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(62,28,12,0.18)"/>
      <g stroke="rgba(34,15,8,0.45)" stroke-width="5">
        <path d="M0 28 H${CONTENT_SIZE}"/><path d="M0 76 H${CONTENT_SIZE}"/>
        <path d="M0 124 H${CONTENT_SIZE}"/><path d="M0 172 H${CONTENT_SIZE}"/>
        <path d="M0 220 H${CONTENT_SIZE}"/>
      </g>
      <g stroke="rgba(255,196,112,0.14)" stroke-width="2">
        <path d="M0 33 H${CONTENT_SIZE}"/><path d="M0 81 H${CONTENT_SIZE}"/>
        <path d="M0 129 H${CONTENT_SIZE}"/><path d="M0 177 H${CONTENT_SIZE}"/>
        <path d="M0 225 H${CONTENT_SIZE}"/>
      </g>
    </svg>
  `);
  return sharp(dirt)
    .modulate({ brightness: 0.72, saturation: 0.82 })
    .composite([{ input: grooves, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function makeCactusTile(leaves) {
  const ridges = Buffer.from(`
    <svg width="${CONTENT_SIZE}" height="${CONTENT_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(38,98,22,0.24)"/>
      <g stroke="rgba(194,229,91,0.24)" stroke-width="8">
        <path d="M20 0 V${CONTENT_SIZE}"/><path d="M70 0 V${CONTENT_SIZE}"/>
        <path d="M122 0 V${CONTENT_SIZE}"/><path d="M174 0 V${CONTENT_SIZE}"/>
        <path d="M224 0 V${CONTENT_SIZE}"/>
      </g>
      <g stroke="rgba(18,54,16,0.22)" stroke-width="3">
        <path d="M42 0 V${CONTENT_SIZE}"/><path d="M96 0 V${CONTENT_SIZE}"/>
        <path d="M148 0 V${CONTENT_SIZE}"/><path d="M200 0 V${CONTENT_SIZE}"/>
      </g>
    </svg>
  `);
  return sharp(leaves)
    .tint('#4f8b2d')
    .modulate({ brightness: 0.78, saturation: 1.15 })
    .composite([{ input: ridges, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function removeDarkLeafGaps(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const brightness = red * 0.22 + green * 0.68 + blue * 0.1;
    if (brightness < 20 && green < 32) data[offset + 3] = 0;
    else if (brightness < 35 && green < 50) data[offset + 3] = clampByte((brightness - 20) * 17);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function resolveBaseTile(spec, sheets) {
  if (spec.sheet) return sheets[spec.sheet][spec.index];
  switch (spec.derive) {
    case 'grass_side':
      return makeStripComposite(sheets.terrain[1], sheets.terrain[0], 66);
    case 'snow_side':
      return makeStripComposite(sheets.terrain[1], sheets.terrain[10], 62);
    case 'gold_ingot':
      return sharp(sheets.special[2]).tint('#e3aa31').modulate({ brightness: 1.08, saturation: 1.12 }).png().toBuffer();
    case 'diamond_gem':
      return sharp(sheets.special[3]).tint('#39dce8').modulate({ brightness: 1.06, saturation: 1.12 }).png().toBuffer();
    case 'farmland':
      return makeFarmlandTile(sheets.terrain[1]);
    case 'cactus':
      return makeCactusTile(sheets.terrain[4]);
    default:
      throw new Error(`未定義の派生マテリアルです: ${spec.id}`);
  }
}

async function createNormalTile(input, strength) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);
  const sample = (x, y) => data[((y + info.height) % info.height) * info.width + ((x + info.width) % info.width)];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) / 255) * strength;
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) / 255) * strength;
      const length = Math.hypot(dx, dy, 1) || 1;
      const offset = (y * info.width + x) * 4;
      output[offset] = clampByte((-dx / length * 0.5 + 0.5) * 255);
      output[offset + 1] = clampByte((-dy / length * 0.5 + 0.5) * 255);
      output[offset + 2] = clampByte((1 / length * 0.5 + 0.5) * 255);
      output[offset + 3] = 255;
    }
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function createOrmTile(input, roughness, metalness) {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);
  for (let index = 0; index < data.length; index++) {
    const luminance = data[index];
    const offset = index * 4;
    output[offset] = clampByte(222 + luminance * 0.13);
    output[offset + 1] = clampByte(roughness * 238 + (255 - luminance) * 0.06);
    output[offset + 2] = clampByte(metalness * 255);
    output[offset + 3] = 255;
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function createEmissiveTile(input, intensity = 0) {
  if (intensity <= 0) {
    return sharp({ create: { width: CONTENT_SIZE, height: CONTENT_SIZE, channels: 4, background: '#000000ff' } })
      .png()
      .toBuffer();
  }
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const luminance = (data[offset] * 0.22 + data[offset + 1] * 0.68 + data[offset + 2] * 0.1) / 255;
    const scale = intensity * (0.18 + luminance * 0.82);
    output[offset] = clampByte(data[offset] * scale);
    output[offset + 1] = clampByte(data[offset + 1] * scale);
    output[offset + 2] = clampByte(data[offset + 2] * scale);
    output[offset + 3] = 255;
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function padTile(input) {
  return sharp(input)
    .resize(CONTENT_SIZE, CONTENT_SIZE, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .extend({ top: PADDING, bottom: PADDING, left: PADDING, right: PADDING, extendWith: 'copy' })
    .png()
    .toBuffer();
}

function buildAtlasSlot(index, atlasSize, cellSize, padding) {
  const columns = Math.floor(atlasSize / cellSize);
  const x = (index % columns) * cellSize;
  const y = Math.floor(index / columns) * cellSize;
  return {
    u0: (x + padding + 0.5) / atlasSize,
    v0: 1 - (y + cellSize - padding - 0.5) / atlasSize,
    u1: (x + cellSize - padding - 0.5) / atlasSize,
    v1: 1 - (y + padding + 0.5) / atlasSize,
  };
}

async function writeWebpAtlas(tiles, filePath, background, options) {
  const composites = tiles.map((input, index) => ({
    input,
    left: (index % (ATLAS_SIZE / CELL_SIZE)) * CELL_SIZE,
    top: Math.floor(index / (ATLAS_SIZE / CELL_SIZE)) * CELL_SIZE,
  }));
  await sharp({ create: { width: ATLAS_SIZE, height: ATLAS_SIZE, channels: 4, background } })
    .composite(composites)
    .webp(options)
    .toFile(filePath);
}

async function chromaKeyPlantCell(sheetPath, index) {
  const metadata = await sharp(sheetPath).metadata();
  const column = index % 3;
  const row = Math.floor(index / 3);
  const left = Math.round(column * metadata.width / 3);
  const top = Math.round(row * metadata.height / 3);
  const right = Math.round((column + 1) * metadata.width / 3);
  const bottom = Math.round((row + 1) * metadata.height / 3);
  const { data, info } = await sharp(sheetPath)
    .extract({ left, top, width: right - left, height: bottom - top })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      if (isKeyMagenta(red, green, blue)) data[offset + 3] = 0;
      else if (red > 200 && blue > 200 && green < 115) {
        data[offset + 3] = clampByte(data[offset + 3] * ((green - 70) / 45));
      }
      if (data[offset + 3] > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  // 生成時のキー色が縁へ数px回り込むため、透明域に近いマゼンタ優勢画素だけを削る。
  // 内側の紫・桃色は透明域から離れているため維持される。
  const alphaSnapshot = Buffer.from(data);
  const spillRadius = 7;
  for (let y = spillRadius; y < info.height - spillRadius; y++) {
    for (let x = spillRadius; x < info.width - spillRadius; x++) {
      const offset = (y * info.width + x) * info.channels;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const magentaDominant = red > 130 && blue > 120 && red + blue > green * 2.15;
      if (data[offset + 3] === 0 || !magentaDominant) continue;
      let touchesTransparency = false;
      for (let dy = -spillRadius; dy <= spillRadius && !touchesTransparency; dy++) {
        for (let dx = -spillRadius; dx <= spillRadius; dx++) {
          const neighbor = ((y + dy) * info.width + (x + dx)) * info.channels;
          if (alphaSnapshot[neighbor + 3] === 0) {
            touchesTransparency = true;
            break;
          }
        }
      }
      if (touchesTransparency) data[offset + 3] = 0;
    }
  }
  // キー除去後の実内容で切り抜き境界を取り直す。
  minX = info.width;
  minY = info.height;
  maxX = -1;
  maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error(`植生セル${index}が空です`);

  return sharp(data, { raw: info })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(PLANT_CONTENT_SIZE, PLANT_CONTENT_SIZE, {
      fit: 'contain',
      background: '#00000000',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();
}

async function buildPlantAssets() {
  const plantTiles = [];
  const slots = {};
  const padding = (PLANT_CELL_SIZE - PLANT_CONTENT_SIZE) / 2;
  for (let index = 0; index < PLANT_SOURCES.length; index++) {
    const source = PLANT_SOURCES[index];
    const content = await chromaKeyPlantCell(PLANT_SHEET, source.index);
    const tile = await sharp({
      create: { width: PLANT_CELL_SIZE, height: PLANT_CELL_SIZE, channels: 4, background: '#00000000' },
    })
      .composite([{ input: content, left: padding, top: padding }])
      .png()
      .toBuffer();
    plantTiles.push(tile);
    slots[source.id] = buildAtlasSlot(index, PLANT_ATLAS_SIZE, PLANT_CELL_SIZE, 0);
    await sharp(tile)
      .webp({ quality: 90, alphaQuality: 96, smartSubsample: true })
      .toFile(path.join(ICON_DIR, `${source.id}.webp`));
  }

  const composites = plantTiles.map((input, index) => ({
    input,
    left: (index % 4) * PLANT_CELL_SIZE,
    top: Math.floor(index / 4) * PLANT_CELL_SIZE,
  }));
  await sharp({ create: { width: PLANT_ATLAS_SIZE, height: PLANT_ATLAS_SIZE, channels: 4, background: '#00000000' } })
    .composite(composites)
    .webp({ quality: 90, alphaQuality: 96, smartSubsample: true })
    .toFile(path.join(OUTPUT_DIR, 'plants.webp'));
  return slots;
}

async function writeGeneratedModule(materialSlots, plantSlots) {
  const runtimeSpecs = Object.fromEntries(MATERIAL_SOURCES.map((spec) => [spec.id, {
    id: spec.id,
    family: spec.family,
    roughness: spec.roughness,
    metalness: spec.metalness,
    normalStrength: spec.normalStrength,
    ...(spec.emissive ? { emissive: spec.emissive } : {}),
    ...(spec.alphaMode ? { alphaMode: spec.alphaMode } : {}),
  }]));
  const source = `// scripts/build-material-atlas.mjs が生成。直接編集しない。\n`
    + `export const MATERIAL_ATLAS_SIZE = ${ATLAS_SIZE} as const;\n`
    + `export const MATERIAL_ATLAS_CELL_SIZE = ${CELL_SIZE} as const;\n`
    + `export const MATERIAL_ATLAS_SLOTS = ${JSON.stringify(materialSlots, null, 2)} as const;\n\n`
    + `export const MATERIAL_ATLAS_SPECS = ${JSON.stringify(runtimeSpecs, null, 2)} as const;\n\n`
    + `export const PLANT_ATLAS_SIZE = ${PLANT_ATLAS_SIZE} as const;\n`
    + `export const PLANT_ATLAS_SLOTS = ${JSON.stringify(plantSlots, null, 2)} as const;\n\n`
    + `export type MaterialAtlasId = keyof typeof MATERIAL_ATLAS_SLOTS;\n`
    + `export type PlantAtlasId = keyof typeof PLANT_ATLAS_SLOTS;\n`;
  await writeFile(path.join(GENERATED_DIR, 'materialAtlas.ts'), source);
}

async function main() {
  if (MATERIAL_SOURCES.length > (ATLAS_SIZE / CELL_SIZE) ** 2) {
    throw new Error('マテリアル数が64スロットを超えています');
  }
  await Promise.all([
    mkdir(OUTPUT_DIR, { recursive: true }),
    mkdir(ICON_DIR, { recursive: true }),
    mkdir(GENERATED_DIR, { recursive: true }),
  ]);

  const [terrainTiles, specialTiles] = await Promise.all([
    detectMaterialGrid(TERRAIN_SHEET),
    detectMaterialGrid(SPECIAL_SHEET),
  ]);
  const sheets = { terrain: terrainTiles, special: specialTiles };
  const baseTiles = [];
  const normalTiles = [];
  const ormTiles = [];
  const emissiveTiles = [];
  const materialSlots = {};

  for (let index = 0; index < MATERIAL_SOURCES.length; index++) {
    const spec = MATERIAL_SOURCES[index];
    let base = await resolveBaseTile(spec, sheets);
    if (spec.id === 'leaves') base = await removeDarkLeafGaps(base);
    const normal = await createNormalTile(base, spec.normalStrength ?? 1);
    const orm = await createOrmTile(base, spec.roughness, spec.metalness);
    const emissive = await createEmissiveTile(base, spec.emissive ?? 0);
    const [paddedBase, paddedNormal, paddedOrm, paddedEmissive] = await Promise.all([
      padTile(base),
      padTile(normal),
      padTile(orm),
      padTile(emissive),
    ]);
    baseTiles.push(paddedBase);
    normalTiles.push(paddedNormal);
    ormTiles.push(paddedOrm);
    emissiveTiles.push(paddedEmissive);
    materialSlots[spec.id] = buildAtlasSlot(index, ATLAS_SIZE, CELL_SIZE, PADDING);
    await sharp(paddedBase)
      .webp({ quality: 88, alphaQuality: 94, smartSubsample: true })
      .toFile(path.join(ICON_DIR, `${spec.id}.webp`));
  }

  await Promise.all([
    writeWebpAtlas(baseTiles, path.join(OUTPUT_DIR, 'block-base.webp'), '#00000000', {
      quality: 88, alphaQuality: 94, smartSubsample: true,
    }),
    writeWebpAtlas(normalTiles, path.join(OUTPUT_DIR, 'block-normal.webp'), '#8080ffff', { lossless: true }),
    writeWebpAtlas(ormTiles, path.join(OUTPUT_DIR, 'block-orm.webp'), '#ffff00ff', { lossless: true }),
    writeWebpAtlas(emissiveTiles, path.join(OUTPUT_DIR, 'block-emissive.webp'), '#000000ff', {
      quality: 86, smartSubsample: true,
    }),
  ]);

  const plantSlots = await buildPlantAssets();
  await writeGeneratedModule(materialSlots, plantSlots);

  const assetFiles = ['block-base.webp', 'block-normal.webp', 'block-orm.webp', 'block-emissive.webp', 'plants.webp'];
  const assetSizes = {};
  for (const file of assetFiles) assetSizes[file] = (await stat(path.join(OUTPUT_DIR, file))).size;
  const manifest = {
    version: 1,
    atlasSize: ATLAS_SIZE,
    cellSize: CELL_SIZE,
    padding: PADDING,
    colorSpaces: {
      'block-base.webp': 'srgb',
      'block-normal.webp': 'linear',
      'block-orm.webp': 'linear-r-ao-g-roughness-b-metalness',
      'block-emissive.webp': 'srgb-emissive',
      'plants.webp': 'srgb-alpha-cutout',
    },
    materials: MATERIAL_SOURCES,
    plants: PLANT_SOURCES,
    slots: materialSlots,
    plantSlots,
    assets: assetSizes,
    compressedBytes: Object.values(assetSizes).reduce((sum, value) => sum + value, 0),
    compressedBudgetBytes: 16 * 1024 * 1024,
  };
  await writeFile(path.join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (manifest.compressedBytes > manifest.compressedBudgetBytes) {
    throw new Error(`PBRアトラスが16MB予算を超えています: ${manifest.compressedBytes}`);
  }
  process.stdout.write(`HalCraft material atlas: ${MATERIAL_SOURCES.length} materials, ${PLANT_SOURCES.length} plants, ${manifest.compressedBytes} bytes\n`);
}

await main();
