# 開発環境セットアップ

本プロジェクトの開発環境の構築手順と、日常の開発コマンドを定める。

> **注**: コードベースは ロードマップ M0([design/07_roadmap.md](./design/07_roadmap.md))で整備される。本書は M0 で作られる構成の規約であり、M0 完了までは「これから作るものの仕様」として読むこと。実際の構成が変わったら本書を更新する。

## 1. 必要なツール

| ツール | バージョン | 備考 |
|---|---|---|
| **Node.js** | 22 LTS | `.node-version` / `engines` で固定 |
| **pnpm** | 9 系 | Corepack で有効化: `corepack enable pnpm` |
| **Git** | 2.40+ | |
| ブラウザ | Chromium 系(開発の主対象)、Firefox、Safari | 対応ブラウザ表は [design/02_architecture.md](./design/02_architecture.md) §8 |

Windows 版 OuDiaSecond 2.06.23(実機または VM)は、フィクスチャ・期待値の生成に必要になる(M0 以降。[design/08_test-fixtures.md](./design/08_test-fixtures.md))。日常の開発には不要。

## 2. 初回セットアップ

```bash
git clone git@github.com:up-tri/oudia-second-web.git
cd oudia-second-web
corepack enable pnpm
pnpm install
```

## 3. リポジトリ構成

```
oudia-second-web/
├── origin/            # 原典 OuDiaSecond のソース(読み取り専用・ビルド対象外)
├── docs/              # 分析・設計・規約ドキュメント
├── packages/
│   ├── format/        # oud2/oud パース・シリアライズ・CSV
│   ├── domain/        # エンティティ・コマンド・整合カスケード
│   ├── derive/        # 導出計算(レイアウト・cellSpec・運用探索)
│   └── render/        # Canvas 描画
├── apps/
│   └── web/           # React シェル UI・PWA
└── fixtures/          # テスト用 oud2/oud ファイル群(台帳: docs/design/08)
```

依存方向は `format ← domain ← derive ← render ← app` の一方向のみ([coding-standards.md](./coding-standards.md) §3)。

## 4. 日常の開発コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバ起動(apps/web、Vite) |
| `pnpm build` | 全パッケージのビルド |
| `pnpm typecheck` | TypeScript 型検査(全 workspace) |
| `pnpm lint` | ESLint + dependency-cruiser(依存方向チェック) |
| `pnpm format` / `pnpm format:check` | Prettier 適用 / 検査 |
| `pnpm test` | Vitest 全件(ユニット + 黄金テスト + プロパティテスト) |
| `pnpm test --filter @oudia/format` | パッケージ単位のテスト |
| `pnpm bench` | ベンチマーク(vitest bench) |
| `pnpm e2e` | Playwright E2E(要 `pnpm exec playwright install`) |

コミット前に最低限 `pnpm typecheck && pnpm lint && pnpm test` を通すこと([definition-of-done.md](./definition-of-done.md))。

## 5. `origin/`(原典ソース)の扱い

- **読み取り専用**。編集・移動・再エンコードをしない(上流との差分比較可能性を保つ)
- 文字コードは **Shift-JIS (CP932)**(`.oud2` サンプルのみ UTF-8 BOM 付き)。日本語コメントを読むときは:
  ```bash
  iconv -f CP932 -t UTF-8 origin/DiagramEdit/DiagramEdit/entDed/CentDedRosen.h | less
  ```
- マニュアル HTML も CP932。タグを除いて読む例:
  ```bash
  iconv -f CP932 -t UTF-8 <file>.html | sed -e 's/<[^>]*>//g'
  ```
- 原典の実装を調べる際の入口は `docs/analysis/` の各ドキュメント(原典ソースパスへの参照付き)

## 6. エディタ設定(VS Code 推奨)

推奨拡張(`.vscode/extensions.json` で共有):

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`) — `formatOnSave` を有効に
- Vitest (`vitest.explorer`)

`.editorconfig` を正とし、インデント 2 スペース・LF・末尾改行ありに統一する(ドキュメント含む)。

## 7. AI(Claude Code 等)での開発

- リポジトリ直下の `CLAUDE.md` にプロジェクトの前提・規約への参照がある。セッション開始時に読み込まれる
- タスクの進め方は [tasking.md](./tasking.md) の「AI との協働」を参照

## 8. トラブルシューティング

| 症状 | 対処 |
|---|---|
| `pnpm install` が engine エラー | Node のバージョンを確認(22 LTS)。`corepack enable pnpm` を再実行 |
| 黄金テストが手元でだけ fail | Git の改行変換を疑う。フィクスチャは `.gitattributes` で `-text`(バイナリ扱い)にしてあるか確認 |
| `origin/` のファイルが文字化けして見える | 正常(CP932)。§5 の iconv を使う |

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-07-15 | 初版作成(M0 で整備する構成の規約として) |
