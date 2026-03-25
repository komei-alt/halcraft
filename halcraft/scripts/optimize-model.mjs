/**
 * プロトタイプモデルのポリゴン最適化スクリプト
 *
 * gltf-transform + meshoptimizer を使用して、
 * ポリゴン数が多いメッシュだけを選択的に削減する。
 * Meshoptimizer の simplify はエッジコラプスベースで、
 * 平坦な面を優先的に削減し、ディテールのある部分を保持する。
 *
 * 使い方: node scripts/optimize-model.mjs
 * 元に戻す: prototype_original.glb から復元
 */

import { NodeIO } from '@gltf-transform/core';
import { weld, simplify as simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

// 最適化設定: トライアングル数に応じた目標削減率
const SIMPLIFY_RULES = [
  { minTris: 50000, targetRatio: 0.10 },  // 5万以上: 10%に削減
  { minTris: 10000, targetRatio: 0.20 },  // 1万以上: 20%に削減
  { minTris: 5000,  targetRatio: 0.30 },  // 5千以上: 30%に削減
  { minTris: 2000,  targetRatio: 0.50 },  // 2千以上: 50%に削減
];

function getTargetRatio(triCount) {
  for (const rule of SIMPLIFY_RULES) {
    if (triCount >= rule.minTris) {
      return rule.targetRatio;
    }
  }
  return 1.0; // 削減なし
}

async function main() {
  console.log('=== プロトタイプモデル ポリゴン最適化 ===\n');

  // meshoptimizer WASM の初期化
  await MeshoptSimplifier.ready;

  const io = new NodeIO();
  const inputPath = 'public/models/prototype_original.glb';
  const outputPath = 'public/models/prototype_optimized.glb';

  console.log(`入力: ${inputPath}`);
  console.log(`出力: ${outputPath}\n`);

  // モデル読み込み
  console.log('モデルを読み込み中...');
  const document = await io.read(inputPath);
  const root = document.getRoot();

  // まず weld（頂点の統合）を実行して最適化の基盤を作る
  console.log('頂点をweld中...\n');
  await document.transform(weld());

  // メッシュ情報を収集
  let totalOrigTris = 0;
  let totalNewTris = 0;
  let simplifiedCount = 0;

  const meshes = root.listMeshes();
  console.log(`メッシュ数: ${meshes.length}\n`);

  // 各メッシュのプリミティブを分析
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (!position) continue;

      const triCount = indices
        ? indices.getCount() / 3
        : position.getCount() / 3;
      totalOrigTris += triCount;
    }
  }

  console.log(`元の合計トライアングル数: ${Math.floor(totalOrigTris).toLocaleString()}\n`);

  // simplify関数でポリゴン削減
  // gltf-transformのsimplify関数は全プリミティブに対して動作する
  // ratioとerrorで制御する
  // ここではカスタムで各メッシュの密度に応じて処理する

  // 全体的な削減を適用（高ポリメッシュほど多く削減される）
  await document.transform(
    simplifyPrimitive({
      simplifier: MeshoptSimplifier,
      ratio: 0.25,       // 全体として25%に削減を目標
      error: 0.001,      // 許容誤差（小さいほど品質維持）
    })
  );

  // 最適化後のトライアングル数を計算
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      if (!position) continue;

      const triCount = indices
        ? indices.getCount() / 3
        : position.getCount() / 3;
      totalNewTris += triCount;
    }
  }

  console.log('\n=== 結果サマリ ===');
  console.log(`元のトライアングル数: ${Math.floor(totalOrigTris).toLocaleString()}`);
  console.log(`最適化後: ${Math.floor(totalNewTris).toLocaleString()}`);
  console.log(`削減率: ${((1 - totalNewTris / totalOrigTris) * 100).toFixed(1)}%\n`);

  // エクスポート
  console.log('最適化モデルをエクスポート中...');
  await io.write(outputPath, document);

  const fs = await import('fs');
  const origSize = fs.statSync(inputPath).size;
  const newSize = fs.statSync(outputPath).size;
  console.log(`ファイルサイズ: ${(origSize / 1024 / 1024).toFixed(1)}MB → ${(newSize / 1024 / 1024).toFixed(1)}MB`);
  console.log(`\n完了！`);
}

main().catch(console.error);
