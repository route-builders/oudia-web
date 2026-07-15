# タスク管理ガイド

本プロジェクト(OuDiaSecond Web再実装)における開発タスクの定義・管理・進行のルールを定める。

## タスク管理の目的

- 開発作業の可視化と進捗追跡
- AI(Claude Code 等)によるタスク理解・実行の支援
- 作業履歴の記録と振り返り
- ロードマップ([design/07_roadmap.md](./design/07_roadmap.md))との対応付け

## タスク管理ツール

| ツール | 用途 |
|---|---|
| **docs/tasks/** | 詳細なタスクドキュメント(AI-native)。実装方針・完了条件まで記述する正 |
| **GitHub Issues** | バグ報告、機能リクエストの受付・議論 |
| **GitHub Projects** | カンバンボードでの進捗管理(任意) |

タスクドキュメントが正であり、Issue はその入口・議論の場とする。小さな修正(タイポ等)は Issue / タスクドキュメントなしで直接 PR してよい。

## タスクの種類

| タイプ | 説明 | 例 |
|---|---|---|
| **Feature** | 新機能の追加・既存機能の拡張 | 時刻表グリッドの実装、oud2 リーダー追加 |
| **Bug** | 既存機能の不具合修正 | スジ描画の座標ずれ修正、バイト一致の破れ修正 |
| **Refactor** | コード品質改善(機能変更なし) | 重複コード抽出、型の厳密化 |
| **Spike** | 技術検証(使い捨て前提の実証) | ロードマップ M0 の S1〜S3 |
| **Docs** | ドキュメントの作成・更新 | 設計ドキュメント更新、ADR 作成 |
| **Chore** | 依存更新、CI/設定変更など | パッケージ更新、CI ワークフロー修正 |

## タスクのライフサイクル

```
[Backlog] → [Ready] → [In Progress] → [In Review] → [Done]
```

| ステータス | 説明 |
|---|---|
| **Backlog** | 未着手、仕様・優先度が未確定 |
| **Ready** | 着手可能。仕様が明確で、依存タスクが解消済み |
| **In Progress** | 開発中 |
| **In Review** | PR 作成済み、レビュー待ち/レビュー中 |
| **Done** | マージ済み、完了条件をすべて満たした |

## タスクドキュメント

### ファイル配置と命名

```
docs/tasks/
├── README.md                      # タスク一覧インデックス
├── 0000-template.md               # テンプレート
├── 0001-spike-oud2-roundtrip.md   # 個別タスク
└── ...
```

命名規則: `{番号4桁}-{タスク名をケバブケース}.md`

### 作成の流れ

1. [0000-template.md](./tasks/0000-template.md) をコピーして新しいファイルを作成(番号は最新 + 1)
2. テンプレートに従って記入。特に **実装方針・完了条件は AI がそのまま実行できる具体度**で書く
3. [tasks/README.md](./tasks/README.md) の一覧表に追加
4. 必要に応じて GitHub Issue を作成し相互リンク

### マイルストーンとの対応

各タスクは原則としてロードマップのマイルストーン(M0〜M8)に紐付ける。マイルストーンの機能一覧([design/07_roadmap.md](./design/07_roadmap.md))を分割したものがタスクになる。ロードマップにない作業が発生した場合は、まずロードマップ側を更新するか、タスクドキュメントに「ロードマップ外」の理由を明記する。

## ブランチ・コミット・PR の規約

### ブランチ命名

```
{type}/{タスクID または短い説明}
```

- type: `feature` / `bugfix` / `refactor` / `spike` / `docs` / `chore`
- 例: `feature/0003-oud2-parser`、`bugfix/0012-diagram-label-angle`、`docs/dev-guidelines`

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/) に従う。本文は日本語でよい。

```
{type}: {変更の要約}

{必要に応じて本文}
```

- type: `feat` / `fix` / `refactor` / `test` / `docs` / `chore` / `perf` / `ci`
- 例: `feat: OuPropertiesText パーサのノードツリー構築を実装`
- 論理的に独立した変更は別コミットに分割する

### プルリクエスト

- PR 本文は [pr/0000-template.md](./pr/0000-template.md) に従う
- PR 作成前チェック: 関連タスク/Issue の存在、[完了の定義](./definition-of-done.md) の該当項目、CI green
- 作業中は Draft PR としてマークする
- 1 PR は 1 タスクに対応させる。大きくなる場合はタスク自体を分割する

## 見積もり

タスク単位の相対規模で見積もる(ロードマップのマイルストーン規模 S/M/L/XL とは別スケールなので注意):

| 規模 | 目安 |
|---|---|
| **S** | 〜2時間 |
| **M** | 〜1日 |
| **L** | 〜3日 |
| **XL** | 3日超 → **分割を必須とする** |

## AI(Claude Code 等)との協働

本プロジェクトは AI との協働開発を前提とする。タスクドキュメントは AI がそのまま実行できる情報密度で書く。

**良い例**:

```markdown
## 実装方針
1. `packages/format/src/node/parse.ts` に parsePropertiesText を実装
2. 分析 docs/analysis/03_file-format.md §2 の文法(Key=Value 行、`Xxx.` ノード開始、`.` 終端)に従う
3. 同名キーの出現順を保持する(PtNode の配列構造。design/04_file-io.md §3.2)
4. テスト: sample2.oud2 をパースして先頭ノードのキー順が原文と一致すること
```

**悪い例**:

```markdown
## 実装方針
oud2 のパーサを実装する
```

### AI 協働時のルール

- 実装開始前に、対象タスクドキュメントと関連する `docs/analysis/`・`docs/design/` の該当節を読ませる
- 原典(`origin/`)の日本語コメントは Shift-JIS (CP932)。読む場合は `iconv -f CP932 -t UTF-8 <file>` を使う
- `origin/` 配下は**読み取り専用**。いかなる変更もしない
- AI が生成したコードも人間のコードと同じ基準([coding-standards.md](./coding-standards.md)、[definition-of-done.md](./definition-of-done.md))でレビューする

### 進捗記録

タスクドキュメント内の「進捗記録」セクションに日付付きで記録する。セッションをまたぐ AI 協働では、この記録が次セッションのコンテキストになる。

## 優先度

| レベル | 説明 |
|---|---|
| **Critical** | データ破損・互換性の破れ(バイト一致ゲートの失敗)に関わるもの |
| **High** | 現行マイルストーンのブロッカー、主要機能の不具合 |
| **Medium** | 一般的なバグ・改善 |
| **Low** | 軽微な問題、将来的な改善 |

**互換性(oud2 の読み書き)に関わる問題は常に最優先**とする。バイト一致ゲートが壊れた状態で他の開発を進めない。

## 関連ドキュメント

- [Definition of Done](./definition-of-done.md) — 完了の定義
- [Task Template](./tasks/0000-template.md) — タスクテンプレート
- [PR Template](./pr/0000-template.md) — PR テンプレート
- [実装ロードマップ](./design/07_roadmap.md) — マイルストーン定義
- [コーディング規約](./coding-standards.md)

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-07-15 | 初版作成 |
