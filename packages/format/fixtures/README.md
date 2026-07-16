# format パッケージ テストフィクスチャ台帳

黄金テスト(oud2 バイト一致)・文法テスト用のフィクスチャ一覧。バイト単位で厳密に
管理する(`.gitattributes` で `-text`。改行変換を一切かけない)。管理方針の正は
`docs/design/08_test-fixtures.md`、テスト設計は `docs/design/04_file-io.md` §5。

## ディレクトリ構成

```
fixtures/
├── current/     現行世代(そのままバイト一致対象。T1)
│   ├── sample.oud2    原典 manual 同梱(1.17, 約1.1MB — 大規模・性能ベンチ兼用。環状/隠し種別)
│   └── sample2.oud2   原典 manual 同梱(1.17, 約98KB — 運用・番線・分岐・平面交差・作業入れ子)
├── roundtrip/   実ファイルをモデル経由でライター正準化した機能別派生(モデル T1 コーパス)
│   ├── canonical-sample2.oud2   sample2 の正準形(= 元ファイルと一致)
│   ├── canceled.oud2            運休(Canceled)
│   ├── next-eki-distance.oud2   駅間距離(NextEkiDistance)
│   ├── loop-hidden.oud2         環状線 + 隠し種別 + パターンダイヤ(sample 由来)
│   ├── empty-comment.oud2       空コメント・別名なし
│   ├── no-window-placement.oud2 WindowPlacement 欠落
│   └── no-app-comment.oud2      FileTypeAppComment 欠落
└── synthetic/   境界ケースを人工生成(バイト一致 T1 / 冪等 T3)
    ├── escape.oud2         値中の \n・\\(ライターが生成し得る正規形エスケープのみ)
    ├── future-unknown.oud2 未知キー(root/Rosen/DispProp)保全の往復検証
    ├── minimal.oud2        最小構造(空ディレクトリ・空値・末尾行。ノードレベルのみ)
    └── unclosed-dir.oud2   閉じ忘れディレクトリ(EOF 受理挙動の確認)
```

## roundtrip/ の由来

`current/sample2.oud2` / `sample.oud2`(実 OuDiaSecond 出力)をモデル
(`RosenFileData`)へ読み込み、機能フラグを設定し、ライター(`writeOud2`)で
書き出して生成した。ライター出力は定義上**正準形**であり、モデルレベル T1
(`readRosenFile → writeOud2 → バイト一致`)が必ず成立する。バイト一致 CI ゲート
(`golden-corpus.test.ts`)のモデルコーパスを構成する。元ファイルが GPLv3 側か FDL 側か
未確定のため、下記 current/ と同じライセンス課題を引き継ぐ。

## current/ の由来とライセンス(⚠️ 未確定)

`sample.oud2` / `sample2.oud2` は原典リポジトリのマニュアル同梱物
(`origin/DiagramEdit/manual/`)からコピーした。

**ライセンスが未確定である。** 原典 `ReadMe.txt` は使用許諾として GPLv3
(`gpl-3.0.txt`)に加え **GNU FDL**(`fdl-1.3.txt` / `fdl-1.2.ja.txt`)を同梱しており、
サンプルファイルがソース(GPLv3)側かマニュアル(FDL の可能性)側かは原典に明示がない。
GFDL は GPLv3 非互換であるため、本リポジトリ(GPLv3)への同梱可否は原典作者への確認
または根拠調査で確定させる必要がある(`docs/design/04_file-io.md` §5.1)。

- **現状**: スパイク S1 の互換実証のため暫定的に同梱している。
- **TODO(#未起票)**: 適用ライセンスを確定し、結果と根拠を本 README に追記する。
  確定できない場合は、同等の構造を持つ自作フィクスチャへ差し替える。

生成手順: `origin/DiagramEdit/manual/sample*.oud2` を無変換でコピー
(`cmp` でバイト一致を確認済み)。改変は一切していない。

## synthetic/ の由来

いずれも本プロジェクトで人工生成した(原典由来ではない)。GPLv3 で公開する。
生成の意図は各テストのコメントを参照。非正規形エスケープ(孤立 `\`・未知 `\x`)は
decode/encode が非対称なため T1(完全バイト一致)の対象にしない
(`docs/design/04_file-io.md` §5.1 注記)。
