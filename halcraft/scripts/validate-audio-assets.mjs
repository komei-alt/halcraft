import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const audioRoot = join(root, 'public', 'audio');
const recordedRoot = join(audioRoot, 'recorded');
const musicRoot = join(audioRoot, 'music');
const ledgerPath = join(audioRoot, 'ASSET_LEDGER.json');

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
    const durationInvalid = isMusic
      ? duration < 20 || duration > 300
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
console.log(`audio assets valid: ${stems.size - musicTracks} cues / ${musicTracks} music tracks / ${audioFiles.length} files`);
