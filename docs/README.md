# ドキュメント索引

OuDiaSecond Web 再実装プロジェクトのドキュメント一覧。

- **analysis/** — 原典(OuDiaSecond ver2.06.23、`origin/` 配下)のソースコード・マニュアルの分析。仕様の一次情報がソースしかない領域の「仕様書」を兼ねる。
- **design/** — Web 版の設計。分析結果を根拠に、技術選定・データモデル・各機能の実装方式を決定する。
- **glossary.md** — 日本語用語 / 原典識別子 / Web 版識別子の対応表。
- **開発プロセス**(規約・テンプレート) — tasking.md、definition-of-done.md、coding-standards.md ほか(下記「開発プロセス」表)。
- **tasks/** — 個別タスクドキュメント。**decisions/** — アーキテクチャ決定記録(ADR)。**pr/** — PR テンプレート。

## 読む順序(初めて読む人向け)

1. **[design/01_goals-scope.md](design/01_goals-scope.md)** — まずここ。何を作るのか・何を作らないのか。
2. **[glossary.md](glossary.md)** — 用語の対応表。以降の全ドキュメントで使う語彙(駅扱・駅 Index/Order・番線・運用…)を押さえる。
3. **[analysis/08_manual-features.md](analysis/08_manual-features.md)** — ユーザ視点の全機能一覧と Tier 分類。原典に何があるかの地図。
4. **[design/02_architecture.md](design/02_architecture.md)** — 技術スタックと方式決定(3 案コンペの審査結果)。設計の背骨。
5. 以降は関心に応じて: データを触るなら analysis/02 → design/03、ファイル I/O なら analysis/03 → design/04、描画なら analysis/05 → design/06、という**分析 → 設計のペア**で読むとよい。

## design/ — 設計ドキュメント

| ドキュメント                                      | 内容                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01_goals-scope.md](design/01_goals-scope.md)     | プロジェクト定義書。背景・ゴールと非ゴール・対象ユーザ・互換性要件・スコープの線引き・GPLv3 ライセンス方針・成功基準                                                               |
| [02_architecture.md](design/02_architecture.md)   | アーキテクチャ設計。技術スタック確定(TS/React/Zustand+Immer/Canvas/PWA)、pnpm workspace 構成、patch 方式 Undo、リリース 8 段階、リスクと軽減策                                     |
| [03_data-model.md](design/03_data-model.md)       | データモデル設計。index 参照モデルの TypeScript 型定義、駅作業の判別可能ユニオン、コマンドレデューサと整合カスケード                                                               |
| [04_file-io.md](design/04_file-io.md)             | ファイル I/O 設計。`@oudia-web/format` パッケージ、OuPropertiesText パーサ、世代別リーダー、テーブル駆動ライター、バイト一致黄金テスト                                             |
| [05_ui-views.md](design/05_ui-views.md)           | UI・ビュー設計。シェル UI(路線ツリー・タブ)、各ビューの仕様、ダイアログ(`usePropEdit`)、キーマップ                                                                                 |
| [06_rendering.md](design/06_rendering.md)         | レンダリング設計。ダイヤグラム 4 レイヤ Canvas、`computeDiagramLayout`、Canvas 時刻表グリッドと `cellSpec`、印刷                                                                   |
| [07_roadmap.md](design/07_roadmap.md)             | 開発ロードマップ。v0.1(ビューア)〜 v0.8(交差支障・印刷)の各リリースの完了条件と作業分解                                                                                            |
| [08_test-fixtures.md](design/08_test-fixtures.md) | テストフィクスチャ調達計画。歴代バイナリの入手・アーカイブ方針、旧世代 oud2 の生成手順(実バイナリ / synthetic)、コーパス台帳、ユーザ提供ファイル受入、運用探索入出力ペアの採取方法 |

## analysis/ — 原典ソース分析

| ドキュメント                                                | 内容                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [01_codebase-overview.md](analysis/01_codebase-overview.md) | コードベース全体とアプリ基盤。Hidemdi モデル(ルート Doc + 12 サブ Doc/View)、CRfEditCmd コマンドパターン、DcDrawLib 描画抽象、CPropEditUi2 |
| [02_domain-model.md](analysis/02_domain-model.md)           | ドメインモデル。entDed/entDgr のエンティティカタログ、駅 Index/Order 体系、時刻の秒表現と循環比較、不変条件と adjust 連鎖                  |
| [03_file-format.md](analysis/03_file-format.md)             | ファイル形式(.oud2 / .oud)。OuPropertiesText 文法、キー仕様表(§5)、世代差分、寛容読込規則、文字コード                                      |
| [04_view-jikokuhyou.md](analysis/04_view-jikokuhyou.md)     | 時刻表ビュー・駅時刻表ビュー。ColSpec/CCellBuilder のセル生成、キーボード入力体系、入力効率機能の実装                                      |
| [05_view-diagram.md](analysis/05_view-diagram.md)           | ダイヤグラムビュー。entDgr パイプライン(スジ構築・折れ線分割・駅間最小所要秒数)、在線表、描画・ズーム仕様                                  |
| [06_view-others.md](analysis/06_view-others.md)             | その他ビュー(路線ツリー・駅・種別・コメント・入出区連携コード一覧)と各プロパティダイアログ                                                 |
| [07_view-operation.md](analysis/07_view-operation.md)       | 運用機能・交差支障チェック。CDedOperationConnecter(運用探索 1 万行)のアルゴリズム、運用表/一覧/一覧図/箱ダイヤ                             |
| [08_manual-features.md](analysis/08_manual-features.md)     | マニュアルからの機能インベントリ。本家 OuDia コアと OuDiaSecond 拡張の 2 層整理、Tier 重要度分類、用語対応表                               |

## 開発プロセス(規約・テンプレート)

| ドキュメント                                   | 内容                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [dev-setup.md](dev-setup.md)                   | 開発環境セットアップ。必要ツール、リポジトリ構成、日常コマンド、`origin/`(CP932)の扱い                    |
| [coding-standards.md](coding-standards.md)     | コーディング規約。TypeScript strict 設定、Biome、層の責務と依存方向、命名(glossary 準拠)、SPDX ヘッダ     |
| [testing-guidelines.md](testing-guidelines.md) | テスト規約。黄金テスト(バイト一致)の運用ルール、プロパティ/スナップショット/E2E の書き方、CI ゲート一覧   |
| [error-handling.md](error-handling.md)         | エラー処理・ロギング規約。エラー分類と対応、Error Boundary 粒度、通知 UI の使い分け、データ保全の不変条件 |
| [tasking.md](tasking.md)                       | タスク管理ガイド。タスクの種類・ライフサイクル、ブランチ/コミット/PR 規約、AI 協働のルール                |
| [definition-of-done.md](definition-of-done.md) | 完了の定義。全タスク共通の基準とタスクタイプ別の追加基準、品質ゲート                                      |
| [tasks/](tasks/README.md)                      | タスクドキュメント一覧([テンプレート](tasks/0000-template.md))                                            |
| [decisions/](decisions/README.md)              | アーキテクチャ決定記録(ADR)一覧([テンプレート](decisions/adr-template.md))                                |
| [pr/0000-template.md](pr/0000-template.md)     | プルリクエストテンプレート                                                                                |

## その他

| ドキュメント               | 内容                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [glossary.md](glossary.md) | 用語集。鉄道・ダイヤ用語(路線・駅・列車・種別・ダイヤ・駅扱・番線・運用・交差支障…)の 日本語 / 原典 C++ 識別子 / Web 版 TypeScript 識別子 対応表と命名規約 |

## 原典の参照方法

- 原典ソースは `origin/` 配下(OuDiaSecond ver2.06.23、GPLv3)。
- 多くのファイルは CP932 のため、日本語コメントは `iconv -f CP932 -t UTF-8`(混在ファイルは `-c` 付き)で読むこと。grep は CP932 のままでは不安定。
