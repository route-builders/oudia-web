# oudia-second-web

OuDiaSecond(Windows 向け時刻表・ダイヤグラム作成ソフト、C++/MFC、GPLv3)を TypeScript + React でブラウザ向けに再実装するプロジェクト。

## 最初に読むもの

- ドキュメント索引と読む順序: `docs/README.md`
- タスクの進め方(ブランチ・コミット・PR 規約含む): `docs/tasking.md`
- 完了条件: `docs/definition-of-done.md`
- 現在のタスク一覧: `docs/tasks/README.md`

## 絶対のルール

- **`origin/` は読み取り専用**(原典 OuDiaSecond のソース)。編集・移動・再エンコード禁止
- **黄金テスト(oud2 バイト一致)が fail する変更はマージ禁止**。互換性(oud2 読み書き)に関わる問題は常に最優先
- 新規ソースファイルには SPDX ヘッダ(`GPL-3.0-or-later`)。依存追加は GPLv3 互換ライセンスのみ

## 原典ソースの読み方

`origin/` 配下の C++ ソース・マニュアル・txt は **Shift-JIS (CP932)**。日本語部分は Read ツールでは文字化けするため、Bash で読む:

```bash
iconv -f CP932 -t UTF-8 <file> | head -200   # 混在ファイルは -c を付ける
```

原典調査の入口は `docs/analysis/`(原典ソースパスへの参照付きの分析ドキュメント)。いきなり `origin/` を全探索しない。

## コードの書き方

- 規約: `docs/coding-standards.md`(TS strict / 命名は `docs/glossary.md` のローマ字識別子 / 層の依存方向 `format ← domain ← derive ← render ← app`)
- テスト: `docs/testing-guidelines.md`
- エラー処理: `docs/error-handling.md`
- 設計と実装が乖離したら `docs/design/` を更新。アーキテクチャ決定の変更は `docs/decisions/` に ADR を書く

## コマンド(M0 で workspace 整備後)

```bash
pnpm typecheck && pnpm lint && pnpm test   # コミット前の最低ライン
pnpm dev                                    # 開発サーバ
```
