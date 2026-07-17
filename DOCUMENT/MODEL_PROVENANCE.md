# 3Dモデル来歴・改修境界

```
Status: 確定
Updated: 2026-07-17
```

この文書は、手作業で制作されたモデルとコード生成モデルの境界を固定する。今後の自動改修では、下記の保護GLBを造形変更せず、コード生成側だけを改善対象とする。

## 変更禁止の手作業モデル

次のGLBは、Nomad Sculptで人間が制作した原本、またはその軽量化派生である。ジオメトリ、マテリアル、ノード階層、頂点色を自動生成モデルへ置換しない。

| ファイル | SHA-256 | 来歴 |
|---|---|---|
| `halcraft/public/models/2026-04-29/airplane.glb` | `17aff768c9e7e7418f687286a8cccf49b4cbf1b98701694b818fb759c7519277` | Nomad Sculpt |
| `halcraft/public/models/2026-04-29/darwin.glb` | `4479334841efb04b23d703c61b4e10169661f80c9b619fe0aea672c24d8fa487` | Nomad Sculpt |
| `halcraft/public/models/2026-04-29/iron-golem.glb` | `fcc48d17f74fd47378e9f676b563459968a7c7be57e34f01db1d7bfc5de7db36` | Nomad Sculpt |
| `halcraft/public/models/2026-04-29/tank.glb` | `93e835c351307e11c5fbf1a8e558252bce18f12d49021c1f01013ed0082ef2db` | Nomad Sculpt |
| `halcraft/public/models/2026-04-29/warden.glb` | `6991ce25df713155efe46588212aebc5cb6e86261e6dc448c96a594e9f02cb3e` | Nomad Sculpt |
| `halcraft/public/models/2026-04-29/zombie.glb` | `33b251f63aa6ddd330d92ec155d989f06008b9d3f9627599f4a5a9f5febb5ba6` | Nomad Sculpt |
| `halcraft/public/models/2026-05-01/car-1.glb` | `6db5001529d3c746bcc71f677221de8071b89681bb8e030ae3722dd59ce3d7bc` | Nomad Sculpt |
| `halcraft/public/models/2026-05-01/chicken.glb` | `4f53b6153b5976e35c9438c8f78bcf404f8d1d285102a773a6400037d439fca4` | Nomad Sculpt |
| `halcraft/public/models/2026-05-01/machine-gun.glb` | `88d678f6ffd50d8ceacc49db607acfdb01c7b0aeea6e3f4a2f1f348c5e396966` | Nomad Sculpt |
| `halcraft/public/models/prototype.glb` | `6a479324d1040de5ff028709311073f1a2a37e0f8c61583641c83ab375c8bca6` | Nomad Sculpt |
| `halcraft/public/models/prototype_original.glb` | `6a479324d1040de5ff028709311073f1a2a37e0f8c61583641c83ab375c8bca6` | Nomad Sculpt原本 |
| `halcraft/public/models/prototype_optimized.glb` | `9cfc72fb711c4eff7683ca1c190c780a79d054adef40adefe079d30ddfd84e3f` | Nomad原本のglTF-Transform軽量化派生 |

`アセット/` にある対応原本と `public/models/` の配置物は、監査時点でハッシュが一致している。

## コードとGLBが混在するファイル

- `VoxelAvatar.tsx`: Wardenのロード、clone、primitive、preloadは保護する。通常ボクセルアバターだけをコード造形の改善対象とする。
- `RemotePlayerWeapon.tsx`: machine-gun GLBのロード、clone、primitive、preloadは保護する。ピッケル、ロケットランチャー、ライトセイバーは改善対象とする。
- `PlayerMachineGun.tsx`: machine-gun GLB本体は保護する。追加銃身、腕、マズル、弾道だけを改善対象とする。
- `Airplane.tsx`、`Tank.tsx`、`Car.tsx` と各GLBモブRendererは、表示調整やアニメーションを除き、モデル本体を変更しない。

## コード生成モデルの監査範囲

| 分類 | 対象 | 2026-07-17の判断 |
|---|---|---|
| キャラクター | 通常VoxelAvatar、Spider、Boss 4種 | 固有シルエット、顔・衣装、関節、低draw構成へ再設計 |
| 手持ち武器 | RocketLauncher、Lightsaber、BuilderHeldItem、remote武器 | 開口部・機構・刃形状・第三者視点欠落を修正 |
| 銃器付加物 | PlayerMachineGun追加部、車載MachineGun、Turret | 砲身をインスタンス化し、回転軸・給弾・放熱機構を追加 |
| 乗り物 | Helicopter、CoasterCart | ヘリは静的部を結合、カートは1 merged drawを維持して造形向上 |
| 投射物 | 徒歩ロケット、戦車砲弾、航空爆弾 | 弾頭、内筒、尾翼、進行方向姿勢を追加 |
| 設置物 | Bed、Torch、Door、Ladder、Campfire、Candle、Lever、WheatSeeds | 共有ジオメトリとInstancedMeshを優先。松明は既存の最適化構成を維持 |
| 特殊ブロック | Stairs、NetherPortal、Rail | 専用形状へ移行し、曲線・勾配の接続を修正 |
| ドロップ | block、ingot、gem、stick、seed | 種別シルエット化とバッチ描画を優先 |
| 建造物 | 家、村、ヘリポート、滑走路、木、地表装飾 | 切妻屋根、梁、庇、煙突、枝、施設標識をブロックインスタンス内で追加 |
| ステージ造形 | 8種のランドマーク彫刻・ブロック拠点 | 全種の固有形状を確認。既存の軽量構成を維持し、平面FXはモデル扱いしない |

`CockpitView.tsx` は現在 `App.tsx` から未使用であり、表示対象外として構造監査のみ実施した。再有効化する場合は、計器・スイッチ群をInstancedMeshまたは結合ジオメトリへ整理してから接続する。`StageScenicPropFX` と `StageSurfaceDetailFX` は平面・地表エフェクトであり、3Dモデル改修の対象外とする。

## 描画負荷の基準

- 同形部品は `InstancedMesh`、静的多部品は結合ジオメトリを優先する。
- 通常モブは近距離8 draw程度、第三者武器は6 draw程度、ボスは12 draw程度を目安とする。
- 頻繁に更新されるストア値を購読するコンポーネント内で、マテリアルをcloneしない。
- 毎フレームの一時 `Vector3`、`Quaternion`、`Material` 生成を避け、`useRef` または共有定数を使う。
- 透明材質、動的ライト、影は、シルエットや操作フィードバックに寄与する箇所だけに限定する。
