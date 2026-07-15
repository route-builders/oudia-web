# [0001] スパイク S1: oud2 ラウンドトリップ最小実証

## メタデータ

| 項目 | 値 |
|------|-----|
| **タスクID** | 0001 |
| **タイプ** | Spike |
| **ステータス** | Ready |
| **優先度** | Critical |
| **規模** | L |
| **マイルストーン** | M0 |
| **作成日** | 2026-07-15 |
| **完了日** | — |
| **関連Issue / PR** | — |

## 概要

OuPropertiesText の文法パーサと、ノードツリーをそのまま書き戻すシリアライザを実装し、`sample2.oud2` で「読込 → 書出 → **バイト一致**」を成立させる。本プロジェクト全体の互換戦略が成立するかを最初に証明する、最重要スパイク。

## 背景・動機

ロードマップ M0 のスパイク S1([design/07_roadmap.md](../design/07_roadmap.md) §2)。バイト一致がこの層で成立しないなら以後の全計画の前提が崩れるため、**S1 合格まで M1 に進まない**と定めている。このスパイクの成果物パーサは捨てずに `@oudia/format` の初版になる(唯一の「捨てないスパイク」)。

## 要件

- [ ] バイト列 → テキストのデコード(CR 除去 → BOM 判定 → UTF-8/SJIS 判別)
- [ ] OuPropertiesText 文法のパース(`Key=Value` 行、`Xxx.` ノード開始、`.` 終端、同名キーの出現順保持)
- [ ] ノードツリー → バイト列のシリアライズ(BOM・CRLF・キー順・エスケープを原文どおり復元)
- [ ] `sample2.oud2` のラウンドトリップがバイト一致
- [ ] 旧世代フィクスチャ(1.00 / 1.05 / 1.09 / 1.10 / 1.16 の oud2、OuDia.1.02 の .oud)が全てパースエラーなく読める

この段階では**ドメイン型への変換をしない**。ノードツリー ↔ バイト列の可逆性だけを証明する。

## 根拠資料(必読)

- `docs/analysis/03_file-format.md` §2 — 文法規則(デコード規則、ディレクトリ判定、エスケープ、0x5C 救済ハック)
- `docs/design/04_file-io.md` §3(パーサ 3 段構成・PtNode ツリー)、§4(シリアライザのバイト一致方針)
- `docs/design/08_test-fixtures.md` — 旧世代フィクスチャの入手・作成方法
- 原典: `origin/libs/OuLib/Str/OuPropertiesText/CConvNodeContainer.cpp`、`origin/libs/OuLib/Str/vectorToFile.cpp`(CP932)
- サンプル: `origin/DiagramEdit/manual/sample2.oud2`(UTF-8 BOM)、`sample.oud2`(1.1MB、性能確認用)

## 実装方針

1. `packages/format` を pnpm workspace に新設(M0 の workspace 雛形と同時でよい)
2. `src/decode.ts`: `decodeOudText(bytes: Uint8Array)` — BOM 判定 → TextDecoder(UTF-8 / shift_jis) → CR/LF 情報の保持
3. `src/node/parse.ts`: `parsePropertiesText(text: string): PtNode` — 順序保存のノードツリー。行分類(プロパティ / ノード開始 / 終端)は分析 §2 の判定規則に厳密に従う
4. `src/node/serialize.ts`: `serializePropertiesText(root: PtNode): Uint8Array` — パース時に保持した情報から原文を完全復元
5. テスト: `sample2.oud2` → parse → serialize → 元バイト列と `Buffer.compare` で一致。旧世代フィクスチャは parse がエラーなく完走すること
6. `sample.oud2`(1.1MB)で所要時間を計測し記録する(design/04 §10 の予算: decode+parse < 250ms)

### 互換性への影響

このスパイク自体が互換性検証。合格すれば黄金テストの雛形(T1 恒等ラウンドトリップ)がここで誕生する。

### 依存関係

- 依存先: なし(最初のタスク)。ただし旧世代フィクスチャの用意([design/08](../design/08_test-fixtures.md))は並行作業
- 依存元: M0 完了判定 → M1 のすべて

## テスト計画

- [ ] `sample2.oud2` バイト一致テスト(黄金テスト T1 の初版)
- [ ] 文法ユニットテスト: エスケープ、ディレクトリ判定、同名キー順、空値、最終行の改行有無
- [ ] 旧世代フィクスチャの読込スモークテスト

## 完了の定義

- [ ] 合格条件: `sample2.oud2` のバイト一致 + 旧世代フィクスチャ全読込
- [ ] 不合格の場合: 分析 §03 と原典 `CConvNodeContainer.cpp` の再照合による原因と修正の記録
- [ ] 結果(合否・計測値・気づき)を本ドキュメントの進捗記録に記載
- [ ] パーサ/シリアライザを `@oudia/format` 初版として通常品質基準([definition-of-done.md](../definition-of-done.md))に引き上げ

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| 文法解釈の誤り(エスケープ・ディレクトリ判定) | High | 分析 §03 と原典ソースの再照合。判定規則をテーブル化してユニットテストで固定 |
| SJIS 0x5C 問題の見落とし | High | design/04 §3 の救済ハック再現。.oud フィクスチャで検証 |
| 改行・BOM の復元漏れ | Medium | デコード時にメタ情報(BOM 有無・改行コード)を保持する設計を最初から入れる |

## 進捗記録

(未着手)
