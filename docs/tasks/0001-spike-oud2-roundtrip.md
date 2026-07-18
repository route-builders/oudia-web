# [0001] スパイク S1: oud2 ラウンドトリップ最小実証

## メタデータ

| 項目               | 値         |
| ------------------ | ---------- |
| **タスクID**       | 0001       |
| **タイプ**         | Spike      |
| **ステータス**     | In Review  |
| **優先度**         | Critical   |
| **規模**           | L          |
| **マイルストーン** | M0         |
| **作成日**         | 2026-07-15 |
| **完了日**         | 2026-07-15 |
| **関連Issue / PR** | —          |

## 概要

OuPropertiesText の文法パーサと、ノードツリーをそのまま書き戻すシリアライザを実装し、`sample2.oud2` で「読込 → 書出 → **バイト一致**」を成立させる。本プロジェクト全体の互換戦略が成立するかを最初に証明する、最重要スパイク。

## 背景・動機

ロードマップ M0 のスパイク S1([design/07_roadmap.md](../design/07_roadmap.md) §2)。バイト一致がこの層で成立しないなら以後の全計画の前提が崩れるため、**S1 合格まで M1 に進まない**と定めている。このスパイクの成果物パーサは捨てずに `@oudia-web/format` の初版になる(唯一の「捨てないスパイク」)。

## 要件

- [x] バイト列 → テキストのデコード(`\0` 検査 → BOM 判定 → UTF-8/SJIS 判別 → 0x5C 救済ハック → CR 除去)
- [x] OuPropertiesText 文法のパース(`Key=Value` 行、`Xxx.` ノード開始、`.` 終端、同名キーの出現順保持)
- [x] ノードツリー → バイト列のシリアライズ(BOM・CRLF・キー順・エスケープを原文どおり復元)
- [x] `sample2.oud2` のラウンドトリップがバイト一致
- [~] 旧世代フィクスチャの読込: 現物入手が未了のため synthetic フィクスチャ(空値・空ディレクトリ・閉じ忘れ・エスケープ)で文法網羅を先行。旧世代 oud2/.oud の現物調達は M0 フィクスチャ環境タスク(design/08)へ引き継ぎ

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

- [x] `sample2.oud2` バイト一致テスト(黄金テスト T1 の初版)
- [x] 文法ユニットテスト: エスケープ、ディレクトリ判定、同名キー順、空値、最終行の改行有無
- [x] 旧世代フィクスチャの読込スモークテスト(synthetic の閉じ忘れディレクトリ受理で代替。現物旧世代は M0 フィクスチャ調達へ引き継ぎ)

## 完了の定義

- [x] 合格条件: `sample2.oud2`(および sample.oud2)のバイト一致。旧世代フィクスチャの現物読込は M0 フィクスチャ調達へ分離(下記進捗記録)
- [x] 不合格の場合: 分析 §03 と原典 `CConvNodeContainer.cpp` の再照合による原因と修正の記録(→ 実装は初回で合格。原典 `vectorToFile.cpp` / `CConvNodeContainer.cpp` を直接照合して忠実移植した)
- [x] 結果(合否・計測値・気づき)を本ドキュメントの進捗記録に記載
- [x] パーサ/シリアライザを `@oudia-web/format` 初版として通常品質基準([definition-of-done.md](../definition-of-done.md))に引き上げ(SPDX ヘッダ・原典クレジット・typecheck/lint/format/test 全 green)

## リスクと対策

| リスク                                       | 影響   | 対策                                                                        |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| 文法解釈の誤り(エスケープ・ディレクトリ判定) | High   | 分析 §03 と原典ソースの再照合。判定規則をテーブル化してユニットテストで固定 |
| SJIS 0x5C 問題の見落とし                     | High   | design/04 §3 の救済ハック再現。.oud フィクスチャで検証                      |
| 改行・BOM の復元漏れ                         | Medium | デコード時にメタ情報(BOM 有無・改行コード)を保持する設計を最初から入れる    |

## 進捗記録

### 2026-07-15 — S1 合格(byte 一致達成)

**結果: 合格。** `sample2.oud2`(98KB)・`sample.oud2`(1.1MB)ともに「読込 → 書出 → 完全バイト一致」が成立した。本プロジェクトの互換戦略(ノードツリー ↔ バイト列の可逆性)が成立することを実証。**M1 へ進んでよい。**

**実装(`@oudia-web/format` 初版):**

- `src/text/decodeOudText.ts` — `\0` 検査(-3)→ BOM 判定 → `TextDecoder` → 0x5C 救済ハック(SJIS 経路のみ)→ CR 除去。原典 `libs/OuLib/Str/vectorToFile.cpp` の `stringFromFile` を直接照合して移植。`Moji5c` 42 文字は原典から逐字コピー。
- `src/text/encodeOudText.ts` — UTF-8 + BOM 前置(.oud/CSV の SJIS 書き出しは v0.2 スコープのため未実装)。
- `src/node/{types,escape,parse,serialize}.ts` — OuPropertiesText 文法。原典 `CConvNodeContainer.cpp` の `decodeNodeContainer` / `encode` / `escape`・`unescape` を忠実移植。**正規表現は不使用**。
- `src/index.ts` — `roundtripOud2` / `parseNodeTree` と低レベル API を公開。
- `src/errors.ts` — 物理層・文法層の負コード体系(マッピング層 -1000 系は M1 で追加)。

**計測(`sample.oud2` 約1.1MB、`pnpm bench`):**

| 段                                  | 実測 mean | 予算                  |
| ----------------------------------- | --------- | --------------------- |
| decodeOudText                       | 約4.3ms   | < 50ms(file-io §10)   |
| decode + parse                      | 約21ms    | < 250ms(タスク) / §10 |
| 往復(decode+parse+serialize+encode) | 約41ms    | 読込 < 600ms(§10)     |

いずれも大きなマージンで予算内。

**気づき / 原典照合で確定した点:**

- **最終行も CRLF 終端**。`FileTypeAppComment=...\r\n` で終わる(原典 encode は各ノード行に必ず改行を付ける)。serialize は最終行にも CRLF を出す実装にした。
- **エスケープは decode/encode 非対称**(`\.`・孤立 `\`・未知 `\x` は decode で保持、encode は `\`→`\\` を常に適用)。sample2 の実エスケープは `\n` のみで対称にラウンドトリップする。非正規形は T1 対象外(design/04 §5.1)。
- **0x5C ハックは削除後に直後を再検査しない**(原典 `erase(idx,1)` 後の `idx++` 挙動)。テストで `十\\` → `十\` を固定。
- 文法エラーの内訳(Aborted / NotClosed)は原典どおりユーザ可視 -1 に集約しつつ `reason` で区別。

**未了(次タスクへ引き継ぎ):**

- 旧世代 oud2(1.00/1.05/1.09/1.10/1.16)・OuDia.1.02 の**現物フィクスチャ**は未調達(design/08 の調達計画に沿って別タスク化)。本スパイクは synthetic フィクスチャ(空値・空ディレクトリ・閉じ忘れ・正規形エスケープ)で文法網羅を先行した。
- `fixtures/current/sample*.oud2` のライセンス(GPLv3 か GFDL か)が未確定。`fixtures/README.md` に TODO として明記。確定できない場合は自作フィクスチャへ差し替える。
