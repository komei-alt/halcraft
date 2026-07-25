import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const audioRoot = join(root, 'public', 'audio');
const recordedRoot = join(audioRoot, 'recorded');
const musicRoot = join(audioRoot, 'music');
const ledgerPath = join(audioRoot, 'ASSET_LEDGER.json');
const creatureManifestPath = join(audioRoot, 'creatures', 'manifest.json');
const ambienceManifestPath = join(audioRoot, 'ambience', 'manifest.json');

const failures = [];
const audioFiles = [];

function readDuration(path) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ], { encoding: 'utf8' }).trim());
}

function readAudioProfile(path) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels',
    '-of', 'json',
    path,
  ], { encoding: 'utf8' });
  const stream = JSON.parse(raw).streams?.[0];
  return {
    sampleRate: Number(stream?.sample_rate),
    channels: Number(stream?.channels),
  };
}

function readTruePeak(path) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', path,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const matches = [...(result.stderr ?? '').matchAll(/Peak:\s+(-?\d+(?:\.\d+)?)\s+dBFS/g)];
  return matches.length > 0 ? Number(matches.at(-1)[1]) : Number.NaN;
}

function validateProductionExport(path, category) {
  try {
    const profile = readAudioProfile(path);
    const expectedChannels = category === 'creature' ? 1 : 2;
    if (profile.sampleRate !== 48000) failures.push(`48 kHz ではありません: ${relative(root, path)} (${profile.sampleRate} Hz)`);
    if (profile.channels !== expectedChannels) failures.push(`チャンネル数が不正: ${relative(root, path)} (${profile.channels}, expected ${expectedChannels})`);
    const peak = readTruePeak(path);
    if (!Number.isFinite(peak)) failures.push(`True Peak を取得できません: ${relative(root, path)}`);
    else if (peak > -0.9) failures.push(`True Peak が高すぎます: ${relative(root, path)} (${peak} dBFS)`);
  } catch {
    failures.push(`音響品質検査に失敗: ${relative(root, path)}`);
  }
}

function validateRuntimeManifest(path, field, category) {
  if (!existsSync(path)) {
    failures.push(`${relative(audioRoot, path)} がありません`);
    return;
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.schemaVersion !== 1) failures.push(`manifest schemaVersion が不正: ${relative(audioRoot, path)}`);
  if (manifest.language !== 'none') failures.push(`言語音声は禁止です: ${relative(audioRoot, path)}`);
  if (!manifest[field] || typeof manifest[field] !== 'object') {
    failures.push(`manifest ${field} が不正: ${relative(audioRoot, path)}`);
    return;
  }
  for (const [cueId, variants] of Object.entries(manifest[field])) {
    if (/dialogue|speech|greeting|voice|narration/i.test(cueId)) failures.push(`セリフ用途のキューは禁止です: ${cueId}`);
    if (!Array.isArray(variants) || variants.length === 0) {
      failures.push(`manifest のバリエーションが空です: ${cueId}`);
      continue;
    }
    for (const stem of variants) {
      if (typeof stem !== 'string' || !/^[a-z0-9][a-z0-9_/-]*$/.test(stem)) {
        failures.push(`manifest のパスが不正です: ${cueId}`);
        continue;
      }
      const exportRoot = join(audioRoot, category === 'creature' ? 'creatures' : 'ambience', stem);
      const ogg = `${exportRoot}.ogg`;
      const mp3 = `${exportRoot}.mp3`;
      if (!existsSync(ogg) || !existsSync(mp3)) {
        failures.push(`manifest の互換ペアがありません: ${relative(audioRoot, exportRoot)}`);
        continue;
      }
      validateProductionExport(ogg, category);
    }
  }
}

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (['.ogg', '.mp3'].includes(extname(path))) audioFiles.push(path);
  }
}

if (!existsSync(ledgerPath)) failures.push('ASSET_LEDGER.json がありません');
else {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const requiredManifests = ['creatures/manifest.json', 'ambience/manifest.json'];
  for (const required of requiredManifests) {
    if (!ledger.runtimeManifests?.includes(required)) failures.push(`台帳のruntimeManifests不足: ${required}`);
  }
  if (!Array.isArray(ledger.sources) || ledger.sources.length === 0) failures.push('音源の出所台帳が空です');
  else {
    for (const source of ledger.sources) {
      if (!source.url || !source.license) failures.push(`台帳情報不足: ${source.pack ?? 'unknown'}`);
      for (const path of source.paths ?? []) {
        if (!existsSync(join(audioRoot, path))) failures.push(`台帳の参照先がありません: ${path}`);
      }
    }
  }
}

validateRuntimeManifest(creatureManifestPath, 'cues', 'creature');
validateRuntimeManifest(ambienceManifestPath, 'beds', 'ambience');

if (!existsSync(recordedRoot)) failures.push('recorded 音源ディレクトリがありません');
if (!existsSync(musicRoot)) failures.push('music 音源ディレクトリがありません');
if (existsSync(audioRoot)) walk(audioRoot);

const stems = new Map();
for (const path of audioFiles) {
  const extension = extname(path);
  const stem = path.slice(0, -extension.length);
  const extensions = stems.get(stem) ?? new Set();
  extensions.add(extension);
  stems.set(stem, extensions);
  if (statSync(path).size === 0) failures.push(`空ファイル: ${relative(root, path)}`);
}

for (const [stem, extensions] of stems) {
  if (!extensions.has('.ogg') || !extensions.has('.mp3')) {
    failures.push(`互換ペア不足: ${relative(root, stem)}`);
    continue;
  }
  try {
    const duration = readDuration(`${stem}.ogg`);
    const fallbackDuration = readDuration(`${stem}.mp3`);
    const relativeStem = relative(audioRoot, stem);
    const isMusic = relativeStem.startsWith('music/') || relativeStem.startsWith('music\\');
    const isAmbience = relativeStem.startsWith('ambience/') || relativeStem.startsWith('ambience\\');
    const durationInvalid = isMusic || isAmbience
      ? duration < (isAmbience ? 10 : 20) || duration > 300
      : duration < 0.005 || duration > 20;
    if (!Number.isFinite(duration) || durationInvalid) {
      failures.push(`長さが不正: ${relative(root, stem)} (${duration}s)`);
    }
    if (!Number.isFinite(fallbackDuration) || Math.abs(duration - fallbackDuration) > 0.2) {
      failures.push(`互換ペアの長さ不一致: ${relative(root, stem)} (${duration}s / ${fallbackDuration}s)`);
    }
  } catch {
    failures.push(`ffprobe 失敗: ${relative(root, stem)}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

const musicTracks = [...stems.keys()].filter((stem) => relative(audioRoot, stem).startsWith('music/')).length;
const ambienceTracks = [...stems.keys()].filter((stem) => relative(audioRoot, stem).startsWith('ambience/')).length;
const creatureTracks = [...stems.keys()].filter((stem) => relative(audioRoot, stem).startsWith('creatures/')).length;
const generalCues = stems.size - musicTracks - ambienceTracks - creatureTracks;
console.log(`audio assets valid: ${generalCues} cues / ${creatureTracks} creature / ${ambienceTracks} ambience / ${musicTracks} music / ${audioFiles.length} files`);
