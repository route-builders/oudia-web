# コーディング規約

本プロジェクトのコードの書き方を定める。[design/02_architecture.md](./design/02_architecture.md) で確定した技術スタック(TypeScript strict + React 18 + Vite + Zustand/Immer、pnpm workspace)を前提とする。

## 1. 言語・コンパイラ設定

- **TypeScript strict モード必須**。追加で `exactOptionalPropertyTypes: true`、`noUncheckedIndexedAccess: true` を有効にする
- `any` は禁止。外部境界(ファイル入力・イベント)は `unknown` で受けて型ガードで絞り込む
- `as` キャストは原則禁止。使う場合は理由をコメントで添える(ブランド型の構築ヘルパー内は例外)
- ESM のみ。CommonJS 構文(`require`)は使わない
- `enum` は使わない。文字列リテラルのユニオン型または `as const` オブジェクトを使う(データモデル設計 [design/03_data-model.md](./design/03_data-model.md) の列挙値定義に従う)

## 2. フォーマッタ・リンタ

| ツール                                                                 | 用途                                         | 実行                                   |
| ---------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| **Prettier**                                                           | フォーマット(設定は既定 + `printWidth: 100`) | `pnpm format` / `pnpm format:check`    |
| **ESLint**(typescript-eslint の type-checked 推奨セット + react-hooks) | 静的検査                                     | `pnpm lint`                            |
| **dependency-cruiser**                                                 | パッケージ間の依存方向の強制(§3)             | `pnpm lint:deps`(`pnpm lint` に含める) |

フォーマットに関する議論はしない(Prettier の出力が正)。ESLint ルールの無効化コメント(`eslint-disable`)は行単位のみ許可し、理由を併記する。

## 3. パッケージ構成と層の責務

依存方向は **`format ← domain ← derive ← render ← app` の一方向のみ**(設計 §3.2)。逆依存・循環は dependency-cruiser で CI エラーにする。

| パッケージ        | 責務                                                         | 禁止事項                                   |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `packages/format` | oud2/oud のパース・シリアライズ・CSV                         | DOM API、Zustand、ドメインロジックの混入   |
| `packages/domain` | エンティティ型、時刻演算、コマンドレデューサ、整合カスケード | DOM API、描画・UI の知識                   |
| `packages/derive` | 導出計算(ダイヤレイアウト、cellSpec、運用探索)               | DOM API(Worker 内実行を想定した純関数のみ) |
| `packages/render` | Canvas 描画(ダイヤグラム、グリッド)                          | ストアへの直接依存(描画入力は引数で受ける) |
| `apps/web`        | React シェル UI、ストア、ファイルアクセス、PWA               | ドメインロジックの実装(domain へ寄せる)    |

**format / domain / derive は「Node だけで動く」ことを守る**(Vitest を Node 実行するため)。`window`・`document`・`navigator` への参照をこの 3 パッケージに書いたら設計違反。

## 4. 命名規則

### ドメイン語彙

- ドメイン概念は **[glossary.md](./glossary.md) のローマ字識別子を正**とする(`Rosen`、`Eki`、`Ressya`、`Ressyasyubetsu`、`Dia`、`EkiJikoku`、`Ekiatsukai` 等)。英訳しない(`Station`、`Train` 等を新造しない)
- 原典の `Cont` サフィックス(コンテナ)は維持する(`ekiCont`、`ressyaCont`)
- ハンガリアン記法(`m_`、`i`、`b` プレフィックス)は原典から**持ち込まない**([design/03_data-model.md](./design/03_data-model.md) §1 の命名方針)

### 一般

| 対象                           | 規則                                                           | 例                             |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------ |
| 型・インターフェース・クラス   | PascalCase                                                     | `RosenFileData`、`EkiJikoku`   |
| 変数・関数                     | camelCase                                                      | `computeDiagramLayout`         |
| 定数(モジュールレベルの不変値) | UPPER_SNAKE_CASE                                               | `SECONDS_PER_DAY`              |
| ファイル                       | 内容が単一の型/クラス中心なら PascalCase、それ以外は camelCase | `parse.ts`、`RosenFileData.ts` |
| React コンポーネント           | PascalCase(ファイル名も一致)                                   | `JikokuhyouView.tsx`           |
| CSS Modules                    | `<Component>.module.css`                                       | `JikokuhyouView.module.css`    |

## 5. コメント

- **「なぜ」を書く。「何をしているか」はコードで表現する**
- 原典の挙動を再現している箇所には**原典参照コメント**を付ける(移植の追跡可能性のため):
  ```ts
  // 原典: CentDedEkiJikokuCont::onEkiInsert (entDed/CentDedEkiJikokuCont.cpp)
  // 前後の駅扱がともに non-None のときのみ通過+主本線で挿入する
  ```
- データモデルの型フィールドには原典の C++ フィールド名をコメント併記する(design/03 の型定義スタイルに従う)
- TODO は `// TODO(#issue番号): 内容` の形式とし、Issue を必ず作る

## 6. ライセンスヘッダ

すべての新規ソースファイル(`.ts` / `.tsx` / `.css`)の先頭に SPDX ヘッダを付ける:

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
```

原典からアルゴリズムを移植したファイルには原著作者クレジットを追記する:

```ts
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)
```

## 7. TypeScript 設計の規約

- **null の扱い**: 「値なし」は `null` に統一する(`undefined` はオプショナルプロパティの「未指定」のみ)。原典の `INT_MIN` / `-1` 番兵は format 層で `null` に変換する(design/03 §2)
- **ブランド型**: 秒単位の時刻は `Seconds` ブランド型を使う。生の `number` と混ぜない
- **判別可能ユニオン**: 種類のある構造(駅作業 7 種など)は discriminated union で表現し、`switch` の網羅性チェック(`never` 代入)を付ける
- **イミュータブル更新**: ストア更新は Immer の `produceWithPatches` を経由する。ストア外でのオブジェクト破壊的変更は禁止
- **ストア更新の唯一の入口は `executeCommand()`**(設計 §4.3)。コンポーネントから直接 `set()` しない
- **導出値はストアに入れない**: ダイヤレイアウト・cellSpec・運用探索結果はストア外のキャッシュに置く(設計 §4.1)

## 8. React の規約

- 関数コンポーネントと hooks のみ。クラスコンポーネントは使わない
- 状態の階層: ドメイン状態 → Zustand ストア、UI ローカル状態(入力中の値等)→ `useState`。迷ったらストアに入れない
- コンポーネントからのデータ読み出しはセレクタ経由(`useStore(s => s.xxx)`)とし、オブジェクト全体の購読を避ける
- Canvas 描画は React の外(render パッケージ)。React は Canvas 要素のライフサイクル管理とイベント接続のみを担う
- スタイルは CSS Modules を使う。インラインスタイルは動的な値(座標等)のみ

## 9. エラー処理

[error-handling.md](./error-handling.md) に従う。要点:

- format 層は例外を投げず、エラーコード + 詳細の結果型で返す(原典の負コード体系。design/04 §3.7)
- ユーザ操作起点の失敗は必ずユーザに見える形で通知する(黙って握りつぶさない)
- `catch` して何もしないブロックは禁止(理由コメント付きの明示的な無視のみ許可)

## 10. テストコード

[testing-guidelines.md](./testing-guidelines.md) に従う。テストコードも本規約(フォーマット・命名)の対象とする。

## 11. その他

- `origin/` 配下は**読み取り専用**。ビルド対象外であり、変更・移動・再エンコードをしない
- 依存パッケージの追加は最小限にし、GPLv3 互換ライセンス(MIT / BSD / Apache-2.0 等)のみ。追加時は PR に用途とライセンスを明記する
- マジックナンバーは名前付き定数にする。特に原典由来の閾値(60 秒閾値、離散ズーム段等)は原典参照コメント付きの定数として一箇所で定義する

## 変更履歴

| 日付       | 変更内容 |
| ---------- | -------- |
| 2026-07-15 | 初版作成 |
