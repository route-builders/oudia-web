# ファイル I/O 設計

本書は OuDiaSecond Web 再実装におけるファイル I/O(`@oudia/format` パッケージとブラウザのファイルアクセス層)の設計書である。`docs/design/02_architecture.md` §6(ファイル I/O)・§7.1(黄金テスト)を具体化する。ファイル形式の一次仕様は `docs/analysis/03_file-format.md`(以下「分析 §03」)であり、本書の §番号参照はそれに従う。

設計の最上位制約は **.oud2 のラウンドトリップ・バイト互換**である。本書のすべての決定はこの制約から演繹される。

---

## 1. 対応フォーマット一覧と対応方針

### 1.1 対応一覧

| # | 形式 | FileType | 読 | 書 | 実装 | 対応リリース |
|---|---|---|---|---|---|---|
| 1 | .oud2 現行 | OuDiaSecond.1.10〜1.17 | ○ | ○(常に 1.17 で書く) | 現行リーダー + 1.17 ライター | 読: v0.1 / 書: v0.2 |
| 2 | .oud2 旧世代 | OuDiaSecond.1.06〜1.09 | ○ | ―(読込後 1.17 で保存) | S09 リーダー | v0.1 |
| 3 | .oud2 旧世代 | OuDiaSecond.1.01〜1.05 | ○ | ― | S05 リーダー | v0.1 |
| 4 | .oud2 初版 | OuDiaSecond.1.00 | ○ | ― | S00 リーダー | v0.1 |
| 5 | .oud(OuDia) | OuDia.1.02 | ○ | ○(機能喪失警告付き) | S00 リーダー / oud ライター | 読: v0.1 / 書: v0.2 |
| 6 | .oud2backup(自動バックアップ) | 中身は #1 と同一 | ○ | ○ | #1 と完全共用。保存先のみ OPFS(§7.6) | v0.2 |
| 7 | 時刻表 CSV | OuDiaSecond.JikokuhyouCsv.* | ○ | ○ | CSV コンバータ | 読: v0.5 / 書: v0.2 |
| 8 | カスタマイズ時刻表 CSV | 同上(Customize) | ― | ○ | 同上 | v0.6 |
| 9 | 駅時刻表 CSV | ― | ― | ○ | 同上(原典 `ViewEkiJikokuhyou/CconvEkiJikokuhyouCsv`) | v0.2 |
| 10 | 運用表 CSV・運用一覧表 CSV | ― | ― | ○ | 同上(原典 `ViewOperationTable/CconvOperationTableCsv`・`ViewAllOperationTable/CconvAllOperationTableCsv`) | v0.7 |
| 11 | 外部時刻表インポート(汎用テキスト / JR おでかけネット / JR 北海道) | ― | × | × | **対象外**(CconvCDedRosenFileDataDigital/2/3。原典でも .oud2 とは独立機能。将来検討) | ― |
### 1.2 対応方針(確定事項)

1. **読込の FileType 判定は原典 `isEncodeAbleFormat` と同一の 5 グループ分岐**とする(分析 §3)。グループ外は原典同様エラー(-1001「FileType が正しくありません」)とし、`FileTypeAppComment` があればエラーダイアログに「より新しいアプリで作成されたファイル」の案内を出す(原典の用途を踏襲)。
2. **書き出しは常に最新 FileType(OuDiaSecond.1.17)のみ**。旧 oud2 形式での保存機能は提供しない(原典と同方針)。旧形式書き出しは .oud(OuDia.1.02)のみ。
3. **全世代リーダーを v0.1 で実装する**(アーキ §3.5「v0.1: oud2/oud 全世代読込」)。S05/S09 固有の変換(RessyaTrack→Operation 等)も v0.1 に含める。分析 §9-5 は後回し可能性に言及しているが、ビューアの「どのファイルでも開ける」信頼を初回リリースの価値とするため先送りしない。
4. **CSV は資産形式ではなく相互運用形式**と位置づけ、ラウンドトリップ・バイト互換の対象外とする(バイト一致 CI ゲートは oud2 のみ)。
5. `.oud2backup` は原典同様「中身は .oud2 と完全同一」とし、リーダー/ライターを 1 バイトも分岐させない(保存後の変更フラグ処理の違いはアプリ層の責務)。

---

## 2. `@oudia/format` パッケージ構成と公開 API

### 2.1 ディレクトリ構成

```
packages/format/src/
├── model/                 # ファイル同型データ型(RosenFileData とその構成型)の宣言
│   ├── rosenFileData.ts   #   Rosen / Eki / EkiTrack2 / Ressyasyubetsu / Dia / Ressya /
│   ├── ekiJikoku.ts       #   EkiJikoku / BeforeOperation / AfterOperation(判別可能ユニオン)
│   ├── dispProp.ts        #   DispProp
│   └── preserved.ts       #   未知ノード保全(PreservedNode)
├── text/
│   ├── decodeOudText.ts   # bytes → string(BOM 判定・\0 検査・SJIS/UTF-8 デコード・0x5C ハック・CR 除去)
│   └── encodeOudText.ts   # string → bytes(UTF-8+BOM / Shift_JIS)
├── node/
│   ├── types.ts           # PtNode / PtProperty / PtDirectory(ノードツリー)
│   ├── parse.ts           # parsePropertiesText(decodeNodeContainer 相当)
│   ├── serialize.ts       # serializePropertiesText(encode 相当)
│   └── cursor.ts          # NodeCursor(消費追跡付き読取カーソル)
├── value/                 # 値ミニフォーマットのスキャナ(すべて decode/encode 対)
│   ├── jikoku.ts          # 時刻文字列
│   ├── color.ts           # COLORREF %08X
│   ├── font.ts            # ';' 区切り Key=Value
│   ├── ekiJikoku.ts       # 「駅扱[;着/発][$番線]」逐次スキャン
│   ├── operation.ts       # 駅作業(種類番号 + '/','$' 交互区切り + 入れ子キー)
│   └── number.ts          # 寛容 int / bool("1"/"0")
├── schema/                # テーブル駆動のキー仕様(読み書き共用)
│   ├── types.ts           # PropSpec / EmitCondition
│   ├── rosen.ts  eki.ts  ekiTrack2.ts  crossingCheckRule.ts
│   ├── ressyasyubetsu.ts  dia.ts  ressya.ts  dispProp.ts
├── reader/
│   ├── fileType.ts        # FileType 判定(5 グループ)
│   ├── current.ts         # 1.10–1.17
│   ├── s09.ts  s05.ts  s00.ts
│   └── adjust.ts          # 読込後補正(範囲外 index → 主本線 等)
├── writer/
│   ├── oud2.ts            # 1.17 ライター
│   └── oud.ts             # OuDia.1.02 ライター(+ 喪失レポート)
├── csv/
│   ├── jikokuhyouCsv.ts  customizeCsv.ts  operationCsv.ts
├── errors.ts              # 負のエラーコード体系・警告型
└── index.ts               # 公開 API
```

### 2.2 公開 API

```typescript
// ---- 読込 ----
export function readRosenFile(bytes: Uint8Array): ReadResult;

export type ReadResult =
  | { ok: true; data: RosenFileData; warnings: ReadWarning[];
      sourceInfo: { fileType: string; encoding: 'utf-8' | 'shift_jis';
                    appComment: string | null } }
  | { ok: false; code: number;            // 原典の負コード体系(§3.7)
      details: ErrorDetail[] };           // COuErrorInfoContainer 相当

// ---- 書出 ----
export function writeOud2(data: RosenFileData, opts?: WriteOud2Options): Uint8Array;
export interface WriteOud2Options {
  /** FileTypeAppComment の値。既定はアプリが注入する自名(例 "OuDiaSecondWeb Ver. 0.2.0")。
      黄金テストでは sourceInfo.appComment を渡して完全バイト一致を検証する */
  appComment?: string;
}

export function writeOud(data: RosenFileData): { bytes: Uint8Array; loss: OudLossReport };
export interface OudLossReport {
  droppedFeatures: string[];      // 警告ダイアログ用(運用・番線・運休 等、原典文言を再現)
  unmappableChars: string[];      // SJIS へ変換できず '?' に置換した文字
}

// ---- 低レベル(テスト・ツール用に公開)----
export function decodeOudText(bytes: Uint8Array): DecodeTextResult;
export function parsePropertiesText(text: string): ParseTreeResult;
export function serializePropertiesText(root: PtDirectory): string; // CRLF 済み文字列
```

### 2.3 型のホーム(依存方向との整合)

`RosenFileData` とその構成エンティティの**型宣言の実体は `@oudia/format/src/model/` に置く**。format は依存方向の最上流であり(format ← domain ← derive ← render ← app)、パーサの出力型を format 自身が持つ以外に一方向依存を満たす方法がないためである。`@oudia/domain` はこれを re-export し、アプリ・derive からは domain 経由で参照する。アーキ §3.3 の domain の責務「`RosenFileData` 型の公開(format の型宣言を re-export)」はこの分担を指す(両ドキュメントで記述を一致させてある)。format の禁止事項(ドメインロジックの混入)は維持される — model/ に置くのは**型宣言と判別可能ユニオンの定義のみ**で、コマンド・整合カスケード等の振る舞いは一切置かない。

### 2.4 外部依存

| 依存 | 用途 | 条件 |
|---|---|---|
| encoding-japanese(MIT) | **.oud / CSV(SJIS 選択時)の Shift_JIS 書き出しのみ** | `writer/oud.ts` と `csv/` から dynamic import。読込パス・oud2 書き出しパスのバンドルに含めない |
| (なし) | それ以外はすべて標準 API(TextDecoder / TextEncoder) | format は DOM 非依存・Node 単体実行可能を維持 |

---

## 3. oud2 パーサ設計

### 3.1 3 段パイプライン

パースは次の 3 段の純関数合成とする。各段が独立にテスト可能であることが狙い。

```
Uint8Array
  │  ① decodeOudText      … 物理層(BOM 判定・デコード・0x5C ハック・CR 除去)
  ▼
string(LF 区切り)
  │  ② parsePropertiesText … 文法層(OuPropertiesText → ノードツリー)
  ▼
PtDirectory(ルート)
  │  ③ reader(世代別 4 系統) … マッピング層(ノードツリー → RosenFileData)
  ▼
RosenFileData + PreservedNode + warnings
```

- ①② は全世代・全形式(.oud2 / .oud / .oud2backup)で完全共通。世代差はすべて ③ に閉じ込める。
- 原典の構造(`stringFromFile` → `CConvNodeContainer::decode` → `CconvCentDed*::from_OuPropertiesText`)と 1:1 に対応させ、挙動の突き合わせを容易にする。

### 3.2 ノードツリー(中間表現)

```typescript
export type PtNode = PtProperty | PtDirectory;

export interface PtProperty {
  readonly kind: 'property';
  readonly name: string;   // 最初の '=' より前。'=' が無い行は行全体
  readonly value: string;  // エスケープ解除済み。'=' が無い行は ''
}

export interface PtDirectory {
  readonly kind: 'directory';
  readonly name: string;            // 末尾 '.' を除いた名前
  readonly children: readonly PtNode[]; // 出現順を完全保存
}
```

- **順序付き配列**であり Map にしない。同名キーの繰り返し(`Eki.`×n、`JikokuhyouFont`×8、`DiaBackColor`×5 等)と出現順が正規の表現だからである(分析 §2)。
- n 番目取得(原典 `getInName(name, idx)` / `sizeInName(name)`)は NodeCursor(§3.4)が提供する。

### 3.3 文法パーサ(`parsePropertiesText`)

入力文字列を `\n` で分割し(CR は ① で除去済み)、行を上から単一パスで処理する。ディレクトリのネストはスタックで管理する。行種別の判定は原典 `decodeNodeContainer` と同一の順序・条件とする。

| 優先 | 条件 | 動作 |
|---|---|---|
| 1 | 空行 | 読み飛ばす |
| 2 | `.` のみの行 | 現在のディレクトリを閉じる。ルートで出現したら**文法エラー**(reason: Container Aborted / ディレクトリが途中で閉じています) |
| 3 | `=` を含まず、末尾が `.` | ディレクトリ開始(名前 = 末尾 `.` 除去)。スタックに push |
| 4 | それ以外 | プロパティ。最初の `=` で名前/値に分割。`=` が無ければ名前のみ・値 `''`(**エラーにしない**) |

- EOF 到達時にスタックが空でない場合、原典は**通常これを受理する**(閉じ忘れディレクトリは EOF までを子として読む。分析 §2)。文法エラー(reason: Container Is Not Closed)になるのは、ディレクトリ開始行の直後に 1 文字も残っていない場合のみで、この挙動も一致させる。
- 文法エラーのユーザ可視コードはいずれも **-1 に集約**する。原典 `CDedRosenFileData_from_string`(DedRosenFileData/CconvCDedRosenFileData.cpp)は `CConvNodeContainer::decode` の負値(Aborted=-1 / NotClosed=-2)を `if (iResult < 0) iRv = -1` で一括して -1 に潰すため、-2 はユーザに表面化しない。内訳(Aborted / NotClosed)は `ErrorDetail.reason` で区別する(§3.7)。
- 値のエスケープ解除は先読み 1 文字の逐次スキャン: `\n`→LF、`\\`→`\`、**それ以外の `\x` は 2 文字ともそのまま保持**(先読みで消費し、次の反復で `x` を再解釈しない)。行末の孤立 `\` もそのまま保持。原典 `decodePropertyString_unescapePropertyValue` と一致させる。
- 実装は約 100 行を想定。**正規表現は使わない**(挙動一致の検証しやすさと、数 MB 入力での性能安定のため)。

シリアライズ側(`serializePropertiesText`)は逆変換: プロパティ = `名前=エスケープ済み値` + CRLF、ディレクトリ = `名前.` CRLF + 子の再帰 + `.` CRLF。エスケープは LF→`\n`、`\`→`\\` の 2 種のみ(`.` はエスケープしない)。

### 3.4 マッピング層: NodeCursor とテーブル駆動 PropSpec

#### NodeCursor(消費追跡)

各ディレクトリの読み取りは `NodeCursor` を通す。目的は (1) 同名 n 番目アクセス、(2) **未消費ノードの検出**(未知キー保全 §3.8 の基礎)。

```typescript
class NodeCursor {
  constructor(dir: PtDirectory);
  values(name: string): readonly string[];       // 同名プロパティ全件(消費マーク付与)
  value(name: string): string | undefined;       // 先頭 1 件
  directories(name: string): readonly PtDirectory[];
  /** 未消費ノードを「直前の消費済み兄弟」アンカー付きで列挙(§3.8) */
  unconsumed(): readonly { anchor: Anchor | null; node: PtNode }[];
}
```

#### PropSpec(読み書き共用テーブル)

エンティティ 1 種につき 1 つの宣言テーブルを `schema/` に置く。**テーブルの行順序 = 書き出し時のキー順序**であり、読込・書出が同じ表を共有することで「読めるのに書き順が違う」型の乖離を構造的に防ぐ(アーキ §6.1、分析 §5 の表と 1:1 対応させる)。

```typescript
export interface PropSpec<E> {
  readonly key: string;
  /** 読込: 同名キーの値列(0 件を含む)を受けて draft を埋める。省略時デフォルトはここで適用 */
  readonly read: (values: readonly string[], draft: Draft<E>, ctx: ReadContext) => void;
  /** 書出: 出力すべき値列を返す。undefined = キー自体を出力しない(条件付き出力) */
  readonly write: (entity: E, ctx: WriteContext) => readonly string[] | string | undefined;
}
```

例(Ressyasyubetsu、分析 §5.5 より抜粋):

```typescript
export const ressyasyubetsuSpecs: PropSpec<Ressyasyubetsu>[] = [
  { key: 'Syubetsumei',
    // -11 はエンティティ局所コード(分析 §5.5)。最終コードへの段階オフセットは ReadContext が加算(§3.7)
    read: ([v], d, ctx) => { if (!v) ctx.error(-11, 'Syubetsumei が指定されていません'); d.syubetsumei = v; },
    write: e => e.syubetsumei },                          // 常に出力
  { key: 'Ryakusyou',
    read: ([v], d) => { d.ryakusyou = v ?? ''; },
    write: e => e.ryakusyou !== '' ? e.ryakusyou : undefined }, // 空なら出力しない
  { key: 'JikokuhyouMojiColor',
    read: ([v], d) => { d.jikokuhyouMojiColor = decodeColor(v) ?? d.jikokuhyouMojiColor; },
    write: e => encodeColor(e.jikokuhyouMojiColor) },
  // …(分析 §5.5 の表の行順のまま)
  { key: 'DiagramSenIsBold',
    read: ([v], d) => { d.diagramSenIsBold = v === '1'; },
    write: e => e.diagramSenIsBold ? '1' : undefined },   // true のみ出力
  { key: 'Hidden',
    read: ([v], d) => { d.hidden = v === '1'; },
    write: e => e.hidden ? '1' : undefined },
];
```

`ctx.error` に渡すコードは**エンティティ局所コード**(分析 §5 の各表の値。原典の各 `From_OuPropertiesText` が返す生の値)であり、ユーザ可視の最終コードは ReadContext が原典と同じ呼び出し階層で段階オフセットを加算して得る(§3.7)。上例の Syubetsumei 未指定は局所 -11 → Ressyasyubetsu 系オフセット -100 で -111 → `from_OuPropertiesText` 系オフセット -1000 で最終 **-1111** となる(原典 entDed/CconvCentDed.cpp の `iRv = iResult - 100` と DedRosenFileData/CconvCDedRosenFileData.cpp の `iRv = iResult - 1000` に対応)。

出力条件のパターンは次の 4 種に整理でき、すべて `write` の戻り値 `undefined` で表現する(条件の enum 化はしない — 「Brunch 有かつ true 時のみ」のような複合条件が現に存在し、関数がもっとも単純)。

| パターン | 例 |
|---|---|
| 常に出力 | Rosenmei、DownMain/UpMain、DiagramTrackOmit、DispProp 全キー |
| true のときのみ `1` | OperationNumberReverse、DiagramSenIsBold、Canceled、JikokuhyouTrackDisplay* 等 |
| 非デフォルトのときのみ | EnableOperation(>0)、BrunchCoreEkiIndex(>=0)、NextEkiDistance(≠0)、ParentSyubetsuIndex(>=0) |
| 空でないときのみ | Ryakusyou、Ressyabangou、Ressyamei、Gousuu、Bikou、EkimeiJikokuRyaku 等 |

なお **DispProp は原典実装が全キー常時出力**(コメントと実装が乖離している。分析 §5.8)であり、実装の側に合わせる。

#### 子ディレクトリの読み

`Eki.`×n → `EkiTrack2Cont.` → `EkiTrack2.`×n、`Dia.` → `Kudari.`/`Nobori.` → `Ressya.`×n の入れ子は、各エンティティのリーダー関数(`readEki(cursor, ctx)` 等)が NodeCursor を再帰的に生成して処理する。`EkiTrack2Cont.` 欠落時は原典どおり「デフォルト 2 番線を維持し DownMain=0 / UpMain=1 に補正」(テキストペースト対応、分析 §5.2)。`Kudari.`/`Nobori.` はどちらか欠落でエラー(局所 -12「RessyaCont が見つかりません」、最終 -1212)。

### 3.5 値ミニフォーマットのスキャナ(`value/`)

すべて decode/encode の対で実装し、**逐次スキャン(charCodeAt ベース)で書く。正規表現は用いない**(分析 §9-3。区切り文字にエスケープ手段がなく、原典の文字位置ベースの解釈と 1:1 で突き合わせるため)。

#### 時刻(`jikoku.ts`)

```typescript
export function decodeJikoku(s: string): Seconds | null | JikokuError;
export function encodeJikoku(s: Seconds | null): string;
```

- decode: 空→`null`。コロンが無ければ**末尾から 2 桁ずつ**区切る(`131545`→13:15:45、`915`→9:15)。秒なし→`:00` 補完、時 1 桁→`0` 補完、先頭スペース→`0` 扱い。範囲 0≤時<24、0≤分<60、0≤秒<60、範囲外はエラー(呼出し元でキーごとの負コードに変換。例 KitenJikoku → 局所 -352、最終 -1352)。
- encode: 時 = 先頭ゼロなし 1〜2 桁、分 = 2 桁、秒 = 0 なら省略・非 0 なら 2 桁。コロンなし。`null`→空文字列。例: 4:59→`459`、0:00→`000`、4:59:30→`45930`。

#### 色(`color.ts`)

`%08X` 8 桁大文字 16 進、COLORREF(`0x00BBGGRR`、下位から R,G,B)。内部型は `{ r, g, b }`。decode は 16 進として読めなければ既定値のまま(寛容)。encode は上位バイト常に `00`。

#### フォント(`font.ts`)

`項目=値` を `;` で連結(`CdConnectedString2`)。項目名は原典の綴りのまま(`Itaric` を含む)を定数化する。**bool 系と 0 値は省略**、出力順は原典実装順(PointTextHeight → LogicalunitTextHeight → LogicalunitCellHeight → Facename → Bold → Itaric → Underline → StrikeOut → Escapement)。

#### EkiJikoku(`ekiJikoku.ts`)

1 列車分の値は「駅 0(方向別の先頭駅)〜終着駅」のカンマ連結。始発前の駅は空要素、終着より後は出力しない。上り列車は上り方向の駅順。

1 要素の文法と decode(分析 §6.2 のロジックをそのまま):

```
element := ''                          … 運行なし
         | atsukai [';' jikokuPart] ['$' trackIdx]
jikokuPart := chaku '/' [hatsu] | hatsu
```

- decode: 最初の `;` で駅扱と残りを分離。残りに `/` があれば前=着・後=発、なければ全体=発。`$` 以降は番線 index。`;` が無くても `$` があれば「駅扱 + 番線」。駅扱は 0..2 の範囲外(旧 3 = 経由なし含む)→ 0。**番線 index が範囲外(<0 または番線数以上)ならその駅・方向の主本線(下り=DownMain / 上り=UpMain)に置換**。
- encode: 駅扱≠None のとき駅扱数字 → 着 or 発が非 null なら `;`、着が非 null なら `着/` を先に書き続けて発(発 null なら空。着のみ=`1;033/`、発のみ=`1;035`)→ **駅扱≠None なら常に `$番線`**。運行なしは要素全体が空。

#### Operation(`operation.ts`)

- **キー名のパス文法**: `Operation{駅Order}{B|A}` + 入れ子は `.{親内作業index}{B|A}` の繰り返し(例 `Operation13B`、`Operation13B.0A`)。パーサはキー名を先頭 `Operation` 除去後、`数字列 + B|A`(`.` 区切り)として逐次パースし、作業ツリーへ配置する。パス不正のキーは未知キーとして保全に回す(§3.8)。
- **値**: 作業のカンマ連結。各作業は種類番号のあと **`/` `$` `/` `$` `/` の交互固定順**で最大 5 パラメータ。スキャナは「次の区切りは何か」を状態として持つ逐次実装とし、種類ごとのパラメータ意味づけ(分析 §6.4 の前作業/後作業 7 種の表)は decode 後に判別可能ユニオン `BeforeOperation` / `AfterOperation` へマップする。運用番号は `;` 区切りの配列(併結編成分)。
- 読込補正: 番線 idx・路線外駅 idx 範囲外 → 0、次列車接続タイプ範囲外 → 0。
- encode 時のキー出力順序(sample2.oud2 の実出力で確認済みの原典順序):
  1. 駅 Order 昇順。
  2. 同一駅では **B(前作業列)→ B の入れ子(作業 index 順・深さ優先)→ A(後作業列)→ A の入れ子** の順。
     (例: `Operation13B` → `Operation13B.0A` → `Operation13A`)
  3. 空の作業列はキー自体を出力しない。
- 増結(1)の子は Before 作業列(`…{idx}B`)、解結(2)の子は After 作業列(`…{idx}A`)。判別可能ユニオンの入れ子構造(`connect.formation: BeforeOperation[]` / `release.released: AfterOperation[]`)と 1:1 対応させる。

### 3.6 寛容読込規則(まとめ)

zod 等の検証層は置かず、以下の原典規則そのものを検証層とする(アーキ §1.2)。各規則は `reader/adjust.ts` と各 PropSpec の `read` に実装し、単体テストを 1 規則 1 テストで常設する。

| 規則 | 適用箇所 |
|---|---|
| 数値が非数 → 0 / キーごとの既定値(原典 `_ttoi`/`stoi` 相当) | 全 int キー |
| bool は `=="1"` 判定(例外: CrossingCheckRule.Enable は `!="0"`、DisplayRessyamei は `=="0"` のみ false) | 全 bool キー |
| 範囲外の番線 index → 主本線(下り DownMain / 上り UpMain) | EkiJikoku、Operation 入換番線 |
| 範囲外の種別 index 等 → 0 | Syubetsu、路線外駅 idx、次列車接続タイプ |
| `Houkou` が解釈不能な `Ressya.` → **黙って Null 列車として無視**(エラーにせず警告に積む) | Ressya |
| `EkiTrack2Cont.` 欠落 → デフォルト 2 番線 + DownMain=0/UpMain=1 | Eki |
| KijunDiaIndex 省略 → DiaName=="基準運転時分" を検索、なければ 0 | Rosen |
| 旧駅扱 3(経由なし)→ 0 | EkiJikoku(全世代) |
| HeadwaySecondMinimum ≥ HeadwaySecond → 0 に補正 | CrossingCheckRule |
| OuterTerminal の Ekimei 空エントリ → 無視 | Eki |

読込後処理は原典 `from_OuPropertiesText` 末尾と同順で実行する: `adjustBrunchLoopCont()` → `adjustOperation()` → `adjustCrossingCheckRuleByEkiEdit()`(これらは `@oudia/domain` の整合カスケード関数を使う…のではなく、**format 内では行わない**。format はファイル同型の生データを返すのみとし、読込直後の adjust 呼び出しと運用探索(OperationConnect)はアプリ層が domain / derive(Worker)に依頼する。依存方向 format ← domain を守るための分担である)。

### 3.7 エラー・警告体系

原典の負コード体系(分析 §8)を踏襲する。PropSpec の `ctx.error` にはエンティティ局所コード(分析 §5 の各表の値)を渡し、ReadContext が原典と同じ段階オフセットを加算して最終コードを得る: Ressyasyubetsu 系 -100 / Dia 系 -200(`CentDedRosen_From_OuPropertiesText` 内)、DispProp 系 -500、`from_OuPropertiesText` 系 -1000(`CDedRosenFileData_from_string` 内)。最終コードを原典と同じ値にするのは、エラーコードがユーザコミュニティの既知情報である可能性と、原典との突き合わせデバッグのためである。

| コード | 意味 |
|---|---|
| -1 | 文法: OuPropertiesText の解釈失敗。トップレベルの `.`(Container Aborted)とディレクトリ開始行がファイル末尾にある場合(Container Is Not Closed)の両方を含む — 原典は decode の負値(-1 / -2)を一括で -1 に潰すため(§3.3)、ユーザ可視コードは常に -1。内訳は `ErrorDetail.reason` で区別 |
| -3 | 物理: ファイルに `\0` が含まれる(バイナリ)。原典ファイル層 `stringFromFile`(vectorToFile.cpp)のコード(-1 オープン失敗 / -2 読み込み失敗 / -3 `\0` 混入)のうち、bytes を直接受け取る Web 版で生じ得るのは -3 のみ |
| -1001 | FileType が正しくありません |
| -1002 / -1003 | Rosen. / DispProp. が見つかりません |
| -1022 / -1032 | Ekijikokukeisiki / Ekikibo 不正 |
| -1111 | Syubetsumei 未指定 |
| -1152 | DiagramSenStyle 不正 |
| -1211 / -1212 | DiaName 未指定 / RessyaCont なし |
| -1352 | 起点時刻不正 |

- `ErrorDetail`(原典 COuErrorInfoContainer 相当)は `{ reason: string, entries: { key: string, value: string }[] }` の蓄積とし、エラーダイアログで「どのノードのどの値が悪いか」を提示する。
- **警告**(パースを止めない事象)は別チャネル `ReadWarning[]` に積む: Null 列車の無視、範囲外 index の補正発生、0x5C ハックの適用、SJIS デコードでの置換文字発生 等。開発者コンソールとアプリの「ファイル情報」ダイアログで確認できるようにする。

### 3.8 未知キー・未知ノードの保全

将来版 OuDiaSecond のファイル(FileType が同グループ内で新キーを持つ 1.18+ 相当)を「開いて保存したら新キーが消えた」を防ぐため、**未消費ノードを保持し書き出し時に同位置へ書き戻す**(アーキ §6.1-5)。

```typescript
export interface PreservedNode {
  /** 直前の消費済み兄弟ノード。null = コンテナ先頭 */
  readonly anchor: { name: string; occurrence: number } | null;
  readonly node: PtNode;   // ツリーごと保持(未知ディレクトリも可)
}
```

- **保持場所はエンティティオブジェクト自身**とする。ルート・Rosen・各 Eki・各 Ressyasyubetsu・各 Dia・各 Ressya・DispProp に任意フィールド `preserved?: PreservedNode[]` を持たせる。index ベースのパスで別置きしない — 駅の削除・並べ替え編集が起きても、未知キーが元のエンティティに随伴して自然に追従・消滅するためである(Immer 上でもオブジェクトごと移動する)。
- domain のコマンドは `preserved` に**一切触れない**(型上 readonly、レビュー規約とlint で保護)。
- **書き戻し**: シリアライザは既知キーをテーブル順に生成した後、各 PreservedNode を「anchor の name の occurrence 番目の直後」に挿入する。anchor が見つからない(編集で消えた)場合はコンテナ末尾に追記。無編集ラウンドトリップでは生成順 = 元順のため、この規則で**バイト位置まで完全復元**される。
- **WindowPlacement は本機構で扱う**: 既知の名前だが Web 版では解釈せず、ルート直下の PreservedNode(anchor = DispProp)として透過保持・書き戻しする(アーキ §4.5)。将来 Web 版がタブレイアウトを保存したくなっても、このノードには書かない(Windows 版の領域として不可侵)。
- `FileTypeAppComment` は例外的に**保全しない**(読込で `sourceInfo.appComment` に記録するのみ)。書き出し時は常に再生成する(§4.4)。

---

## 4. oud2 シリアライザ設計

### 4.1 バイト一致の方針

**「原典 Windows 版が保存したファイルを読み、無編集で保存したとき、FileTypeAppComment 行を除く全バイトが一致する」ことを不変条件とする。** FileTypeAppComment はアプリ名 + 版そのものであり原典でも版が変われば変わる行、かつ読込で未使用のため、この 1 行のみ例外とする(黄金テストでは `appComment` オプションに元の値を渡して**完全バイト一致**で検証する。§5.2)。

一致させる要素の全リスト:

| 要素 | 規則 |
|---|---|
| BOM | UTF-8 BOM(EF BB BF)を必ず前置 |
| 改行 | 全行 CRLF。最終行(FileTypeAppComment)も CRLF で終端 |
| キー順序 | schema テーブルの行順(= 分析 §5 の書き出し順) |
| ノード順序 | Rosen 内: Rosenmei → 別名 → Eki× → Ressyasyubetsu× → Dia× → 路線プロパティ群 → Comment。ルート: FileType → Rosen. → DispProp. → (preserved: WindowPlacement.) → FileTypeAppComment |
| 条件付き出力 | §3.4 の 4 パターン。キー単位で `write` が担う |
| 値書式 | 時刻・色・フォント・EkiJikoku・Operation の各 encode(§3.5) |
| エスケープ | LF→`\n`、`\`→`\\` のみ |
| 未知ノード | §3.8 の anchor 位置へ書き戻し |

### 4.2 シリアライズ手順

```
RosenFileData
  │ ① writer/oud2.ts: schema テーブル駆動で PtDirectory を構築
  │    (既知キー生成 → preserved 挿入 → FileType/FileTypeAppComment 付加)
  ▼
PtDirectory(ルート)
  │ ② node/serialize.ts: 文字列化(エスケープ + CRLF)
  ▼
string
  │ ③ text/encodeOudText.ts: UTF-8 エンコード + BOM 前置
  ▼
Uint8Array
```

パース(§3.1)と対称の 3 段とし、中間の PtDirectory を挟むことで「ツリーとして正しいがマッピングが違う」「ツリー化は正しいが文字列化が違う」を分離してテストできる。

### 4.3 スカラの文字列化規則

| 型 | 規則 |
|---|---|
| int | 10 進、そのまま(`String(n)`)。先頭ゼロなし |
| bool | `'1'` / (false は原則キー省略。常時出力キーのみ `'0'`) |
| 列挙 | 原典の識別子文字列そのまま(`Jikokukeisiki_Hatsuchaku`、`SenStyle_Jissen`、`Ekikibo_Ippan` 等)。数値化しない |
| 複数行文字列(Comment / Bikou) | `\n` エスケープで 1 行化 |
| DiagramTrackOmit | `0`/`1` のカンマ連結、番線数分を常に出力 |
| JikokuhyouSyubetsuChangeDisplay* 等の複合値 | カンマ連結 5 値 / 2 値(分析 §5.2 の書式) |

### 4.4 FileType と FileTypeAppComment

- 先頭行は常に `FileType=OuDiaSecond.1.17`。
- 最終行は `FileTypeAppComment=<値>`。既定値はアプリが `writeOud2` 呼出し時に注入する `OuDiaSecondWeb Ver. <アプリ版>`(形式は原典 `<AppName> Ver. <version>` を踏襲)。読込では解釈しない(原典同様、FileType エラー時の案内表示にのみ使用)。

### 4.5 書き出し時に検証しないこと

シリアライザは**入力 `RosenFileData` の整合性を検証しない**(範囲外 index の補正は読込側の責務、編集中の整合維持は domain の整合カスケードの責務)。二重の防衛は責務境界を曖昧にする。ただし開発ビルドでは assert(列車の駅時刻数 = 駅数、ダイヤ名一意)を有効にする。

---

## 5. ラウンドトリップ保証のテスト設計

### 5.1 コーパス構成

```
packages/format/fixtures/
├── current/                  # 現行世代(そのままバイト一致対象)
│   ├── sample.oud2           # 原典 manual 同梱(1.17, 1.1MB — 大規模・性能ベンチ兼用)
│   ├── sample2.oud2          # 原典 manual 同梱(1.17, 98KB — 運用・番線・作業入れ子を含む)
│   └── …(§6.4 セルフチェックで収集した許諾済み実ファイル)
├── legacy/                   # 旧世代(読込 → 1.17 書出の期待値と対で置く)
│   ├── v100/foo.oud2  + foo.expected.oud2
│   ├── v105/…         + …
│   ├── v109/…         + …
│   └── oud/bar.oud    + bar.expected.oud2
├── synthetic/                # 境界ケースを人工生成
│   ├── escape.oud2           # 値中の \n・\\(ライターが生成し得る正規形エスケープのみ。T1 対象)
│   ├── escape-noncanon.oud2  # 孤立 \・未知エスケープ \x(T1 対象外。下記注記参照)
│   ├── sjis-0x5c.oud         # 0x5C ハック対象(「十\」等を含む壊れた SJIS)
│   ├── unknown-keys.oud2     # 未知キー・未知ディレクトリ(1.18 想定)
│   └── edge-jikoku.oud2      # 0:00 / 23:59:59 / 秒付き / 空時刻
└── oud-export/               # .oud 書き出しの期待値(Windows 版で生成)
    └── sample2.expected.oud
```

- **非正規形エスケープは T1(完全バイト一致)の対象にしない**: エスケープの decode/encode は非対称であり(decode は孤立 `\` と未知の `\x` をそのまま保持、encode は `\`→`\\` を常に適用。§3.3)、孤立 `\`・未知エスケープを含む入力は正しい実装でも再書出で `\\`/`\\x` に変わる(原典 Windows 版でも同様にバイト一致しない)。escape-noncanon.oud2 は decode の保持挙動の単体テストと T3(冪等性: 1 回目の書出以降は安定)で検証する。
- 期待値ファイル(`*.expected.*`)は **Windows 版 OuDiaSecond ver2.06.23 で「開く → 名前を付けて保存」した実出力**をコミットする。生成手順(使用した版・操作)を fixtures/README.md に記録する。
- sample.oud2 / sample2.oud2 は原典リポジトリのマニュアル同梱物(origin/DiagramEdit/manual/)由来である。原典 ReadMe.txt は使用許諾として GPLv3(gpl-3.0.txt)に加え **GNU FDL**(fdl-1.3.txt / fdl-1.2.ja.txt)を同梱しており、サンプルファイルがソース(GPLv3)側かマニュアル(FDL の可能性)側かは原典に明示がない(GFDL は GPLv3 非互換)。**同梱前に原典作者への確認または根拠調査で適用ライセンスを確定し、結果と根拠を fixtures/README.md に記載する**。確定できない場合は自作フィクスチャで代替する。収集ファイルは提供者の明示許諾を得たもののみ入れる。

### 5.2 テスト種別

| ID | 内容 | 対象 | 合格条件 |
|---|---|---|---|
| T1 | **恒等ラウンドトリップ**: `writeOud2(readRosenFile(bytes).data, { appComment: sourceInfo.appComment })` | current/ + synthetic/ の .oud2(escape-noncanon.oud2 を除く。§5.1 注記) | **元バイト列と完全一致**(BOM・CRLF 含む) |
| T2 | **旧世代変換**: 旧ファイルを読み 1.17 で書出 | legacy/ | `*.expected.oud2` と FileTypeAppComment 行正規化のうえ一致 |
| T3 | **冪等性**: T1/T2 の出力を再読込 → 再書出(escape-noncanon.oud2 を含む全ファイル) | 全ファイル | 1 回目の出力と完全一致(deep-equal でなくバイト比較) |
| T4 | **値スキャナのプロパティテスト**: fast-check で `decode(encode(x)) === x`(有効域)、`encode(decode(s)) === s`(正規形文字列) | jikoku / color / font / ekiJikoku / operation | 恒等 |
| T5 | **文法ファズ**: ランダムなノードツリー生成 → serialize → parse → ツリー一致。壊れた入力(未閉ディレクトリ等)でクラッシュせず負コードを返す | node/ | 恒等・無例外 |
| T6 | **.oud 書き出し**: `writeOud(readRosenFile(sample2).data)` | oud-export/ | 期待値と一致 + loss レポートの内容検証 |

### 5.3 差分レポータ

バイト不一致時に「どの行のどのキーがどう違うか」を即座に特定できるカスタムレポータを Vitest に組み込む。

- 不一致の**最初の行番号**、期待/実際の行テキスト(制御文字を可視化)、その行までのノードパス(例 `Rosen > Eki[12] > EkiTrack2Cont > EkiTrack2[2] > TrackName`)を表示する。
- 行内容が同じで改行・BOM のみ違う場合は hex ダンプ(前後 16 バイト)を出す。
- 差分が「キーの有無」なら該当 PropSpec の出力条件を疑うヒントを添える(schema テーブルへの逆引きが可能なため機械的に出せる)。

### 5.4 CI ゲート運用

- v0.2 リリース前に T1〜T6 を **CI 必須ゲート**(merge ブロック)として稼働させる(アーキ §7.1)。
- 以後、schema・value・node への変更 PR はゲート通過が絶対条件。fixtures の追加は誰の変更も壊さない(追加 = ゲート強化)。
- 性能リグレッション検知として、sample.oud2(1.1MB)の parse / serialize 所要時間を CI で記録・閾値監視する(§10)。

### 5.5 アプリ内セルフチェックとの連携

アプリの「互換セルフチェック」(アーキ §6.4: 開く → 保存 → 差分ゼロ確認)は T1 と同一の比較器・レポータを再利用する(format パッケージが比較器を公開する)。差分検出時に生成する匿名化レポート(キーパス・行番号のみ、値はマスク)は、そのまま synthetic/ フィクスチャの再現テストを書くための入力形式とする。

---

## 6. 旧形式・OuDia .oud の読込変換

### 6.1 世代別リーダーの実装方針

4 リーダー(current / S09 / S05 / S00)は次を共有する: 文法パーサ(§3.3)、値スキャナ(§3.5。ただし旧書式バリアントを引数で切替)、寛容読込規則(§3.6)、出力先の `RosenFileData`(常に現行 1.17 相当の内部モデル)。**世代差分のみを各リーダーに書く**。原典が S09/S05/S00 を独立クラスにしている構造に合わせ、共通化しすぎて挙動差を潰さないよう「差分は明示的に列挙する」スタイルを取る。

| リーダー | FileType | 差分変換(分析 §7) |
|---|---|---|
| current | 1.10–1.17 | なし(グループ内は新キーを省略時デフォルトで吸収する前方互換読み) |
| S09 | 1.06–1.09 | Operation のパラメータ配置が旧式: 出区 `3/時刻$運番`(入出区連携コードなし)、路線外始発 `4/駅idx$時刻/着時刻$運番`、前作業 Junction の旧 p2(解結表示省略)読み飛ばし。`SyubetsuChange` キー → 次列車接続 type へ統合 |
| S05 | 1.01–1.05 | 別キー `RessyaTrack`(1 要素 = `番線idx[;作業/p1$p2/p3]`、作業 0=なし/1=入換/2=入出区)と `OperationNumber` を読み、現行の EkiJikoku 内番線 + Before/AfterOperation + 運用番号へ変換。OuterTerminal は Ekimei のみ |
| S00 | 1.00 / OuDia.1.02 | EkiJikoku に `$番線` なし(番線は主本線に設定)。駅扱 3(経由なし)→ 0。`Kyoukaisen` を読み**分岐駅設定の推定**に利用。OuDiaSecond1.00 拡張キー(EkiTrack2Cont / DownMain / UpMain 等)は「あれば読む」 |

- S00 の Kyoukaisen → 分岐推定ロジックは原典 `CconvCentDedS00.cpp` からの忠実移植とする(独自解釈しない)。
- 旧世代リーダーの正しさは T2(Windows 版生成の期待値との比較)で担保する。旧世代の書き出しは存在しないため、T1 の対象にはならない。

### 6.2 .oud(OuDia.1.02)の読込

.oud は S00 リーダーで .oud2 と**同一の文法・同一のコード経路**で読む。文字コードだけが異なり(BOM なし = Shift_JIS)、それは §3.1 の ① が拡張子を見ずに BOM で吸収する。拡張子による分岐は一切置かない(原典と同じ)。

### 6.3 .oud 書き出し

`writer/oud.ts`。FileType=`OuDia.1.02`、Shift_JIS + BOM なし + CRLF。

- 出力キー集合(分析 §7.4): Rosen は Rosenmei / Eki× / Ressyasyubetsu× / Dia× / KitenJikoku / DiagramDgrYZahyouKyoriDefault / Comment のみ。Eki は Ekimei / Ekijikokukeisiki / Ekikibo / Kyoukaisen / DiagramRessyajouhouHyouji 系のみ。Ressya は Houkou / Syubetsu / Ressyabangou / Ressyamei / Gousuu / EkiJikoku(**$番線なしの旧書式**)/ Bikou。DispProp は現行と同一内容(OuDia 側が未知キーを無視する)。
- **Kyoukaisen 自動生成**: KudariChaku 駅の次が NoboriChaku 駅のとき `1`。KudariHatsuchaku / NoboriHatsuchaku は `Jikokukeisiki_Hatsuchaku` に落とす。
- Operation・番線・Canceled・分岐/環状・路線外発着 等は出力しない。**喪失する機能の一覧を `OudLossReport.droppedFeatures` で返し**、アプリは保存前に警告ダイアログ(文言は原典「一部の情報が失われます」系を踏襲)を表示、キャンセル可能とする。
- SJIS に変換できない文字(Unicode 固有文字等)は `?` に置換し、`unmappableChars` として同ダイアログに列挙する。

---

## 7. ブラウザでのファイルアクセス

### 7.1 抽象化: FileAccessPort

format は bytes ⇔ RosenFileData のみを扱い、**ファイルの取得・保存はアプリ層(apps/web)の `FileAccessPort`** に隔離する。実装は 2 系統を用意し、起動時の機能検出(`'showOpenFilePicker' in window`)で選択する。

```typescript
export interface FileAccessPort {
  open(): Promise<OpenedFile | null>;              // ピッカー起動
  openFromHandleLike(h: unknown): Promise<OpenedFile>; // D&D / launchQueue / 最近使ったファイル
  save(file: OpenedFile, bytes: Uint8Array): Promise<SaveOutcome>;   // 上書き
  saveAs(bytes: Uint8Array, suggestedName: string,
         kind: 'oud2' | 'oud' | 'csv'): Promise<SaveOutcome>;
  readonly capabilities: { overwrite: boolean; recentReopen: boolean };
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  handle: FileSystemFileHandle | null;  // フォールバック時 null
}
```

### 7.2 File System Access API 実装(Chromium 系)

- **開く**: `showOpenFilePicker({ types: [{ description: 'OuDia/OuDiaSecond ファイル', accept: { 'application/octet-stream': ['.oud2', '.oud', '.oud2backup'] } }] })`。
- **上書き保存**: `handle.createWritable()` → `write(bytes)` → `close()`。createWritable は一時ファイル経由の原子的置換であり、書き込み途中クラッシュで元ファイルが壊れない。
- **権限**: 保存直前に `handle.queryPermission({ mode: 'readwrite' })`、必要なら `requestPermission`。拒否されたら saveAs へフォールバック。
- **名前を付けて保存**: `showSaveFilePicker`(suggestedName = 現ファイル名、.oud 書き出し時は拡張子 .oud)。

### 7.3 フォールバック実装(Firefox / Safari)

- **開く**: `<input type="file" accept=".oud2,.oud,.oud2backup">`。
- **保存**: `Blob` + `<a download>`(ダウンロード保存)。`capabilities.overwrite = false` を UI に伝え、保存ボタンの文言を「ダウンロード」にする。
- 上書き保存が使えない不便は、OPFS 自動バックアップ(§7.6)による「保存し忘れてもデータが残る」保証で補償する(アーキ §9.6)。

### 7.4 ドラッグ&ドロップ

- ウィンドウ全体を drop ターゲットにする(`dragover` で `preventDefault`、ドロップ可視化オーバーレイ表示)。
- `drop` では **`DataTransferItem.getAsFileSystemHandle()` を優先**(Chromium。取得できれば以後の上書き保存が可能)。非対応ブラウザは `getAsFile()` で bytes のみ取得(handle なし = 保存はダウンロード方式)。
- 複数ファイルドロップは先頭 1 件のみ採用し、残りは無視した旨をトースト表示(原典は SDI 相当で同時 1 ファイル。タブ多重ドキュメント化は将来拡張とし、現段階では踏襲する)。
- 未保存変更があるドキュメントを持つ状態でのドロップは、開く前に保存確認ダイアログ(原典の文言体系を踏襲)。

### 7.5 PWA ファイル関連付け

- Web App Manifest に `file_handlers`(`.oud2` / `.oud` / `.oud2backup`)を宣言し、インストール済み PWA では OS の「このアプリで開く」から起動できるようにする。
- 起動側は `window.launchQueue.setConsumer()`(Chromium 系のみ)で FileSystemFileHandle を受け取り、`openFromHandleLike` に渡す。非対応環境では単に機能が現れないだけで劣化なし。

### 7.6 自動バックアップ(OPFS)とクラッシュ復元

原典仕様(タイマーではなく**編集コマンド契機**、前回バックアップから 60 秒経過していれば実行。`CDiagramEditDoc::backup`、閾値 `iBackupIntervalSecond = 60`)を踏襲し、保存先を OPFS にする。

- **契機**: `executeCommand()` 完了フックで判定。`(now - lastBackupAt) >= 60_000 && 変更カウンタ != 0` のとき、`requestIdleCallback` でシリアライズ(`writeOud2`)+ OPFS 書き込みを行う。メインスレッド実行とし(Worker 化はアーキの「Worker は運用探索・交差支障のみ」に従い当面しない)、sample.oud2 級(1.1MB)でシリアライズ 100ms 超が実測されたら初めて Worker 化を検討する。
- **レイアウト**:

  ```
  OPFS:/backups/<docId>/
  ├── meta.json      # { fileName, lastSavedAt, lastBackupAt, dirty, modifyCount }
  ├── 20260715-1030.oud2backup
  ├── 20260715-1031.oud2backup
  └── …(最新 5 世代を保持、古いものから削除)
  ```

  原典は「元ファイル名_yyyymmddhhmm.oud2backup を 1 世代のみ」だが、Web 版はユーザのファイルシステムを汚さない OPFS 内であるため**5 世代**に拡張する(定数、設定変更可)。ファイル名の時刻書式は原典の yyyymmddhhmm に秒なしを踏襲しつつ、同一分内の連続バックアップは上書きとする。
- **docId**: ドキュメントを開くたびに発行する UUID。FileSystemFileHandle がある場合は idb に `handle ↔ docId` を保存し、同一ファイルの再オープンで既存 docId を引き継ぐ(`handle.isSameEntry()` で照合)。
- **クラッシュ検出**: 最初の編集で `meta.json` の `dirty: true` を書き、正常保存・正常クローズ(`beforeunload` 時に変更カウンタ 0)で `false` に戻す。起動時に全 docId を走査し、`dirty === true` のバックアップが見つかったら復元ダイアログ(ファイル名・バックアップ時刻の一覧 → 選択で通常の読込パイプラインへ)を出す。
- **容量**: `navigator.storage.estimate()` で残量を確認し、逼迫時は古い docId のバックアップから削除。`navigator.storage.persist()` を初回保存時に要求する。

### 7.7 最近使ったファイル

- idb ストア `recentFiles`: `{ name, handle?: FileSystemFileHandle, lastOpenedAt, byteSize }` を最大 10 件、LRU。
- Chromium 系では handle を IndexedDB に永続化でき、クリックで再オープン(必要なら `requestPermission`)。Firefox / Safari では handle が保存できないため**表示のみ**(クリックでファイルピッカーを開く)とし、`capabilities.recentReopen` で UI を出し分ける。

---

## 8. 文字コード処理

### 8.1 読込パイプライン(`decodeOudText`)

原典 `stringFromFile`(vectorToFile.cpp)の手順を bytes 上で忠実に再現する。

1. **`\0` 検査**: bytes に 0x00 が含まれたらエラー -3(バイナリファイル)。
2. **BOM 判定**: 先頭 3 バイトが `EF BB BF` なら UTF-8、それ以外は Shift_JIS。**拡張子では判定しない**。
3. **デコード**:
   - UTF-8: `new TextDecoder('utf-8')`(既定で BOM を除去する)。`fatal: false`(不正シーケンスは U+FFFD 置換。原典 MSVC も停止しないため寛容側に合わせ、置換発生は警告に積む)。
   - Shift_JIS: `new TextDecoder('shift_jis')`(WHATWG Encoding Standard の index-jis0208 ≒ CP932)。`fatal: false`。
4. **0x5C 救済ハック(SJIS 経路のみ)**: デコード後の文字列を idx=1 から走査し、`s[idx] === '\\'` かつ `s[idx-1]` が次の 42 文字集合に含まれるとき、その `\` を 1 文字削除する。

   ```
   ―ソЫⅨ噂浬欺圭構蚕十申曾箪貼能表暴予禄兔喀媾彌拿杤歃濬畚秉綵臀藹觸軆鐔饅鷭偆砡纊犾
   ```

   文字集合は原典 `vectorToFile.cpp` の `Moji5c` 定数をそのまま定数化する(「CP932 で 2 バイト目が 0x5C の文字を機械生成」はしない — 原典と集合がずれる余地を残さないため)。削除後は原典同様、**直後の文字を再検査しない**(`erase` 後に idx++ が進む挙動: `十\\` → `十\` になり 2 個目は残る)。適用時は警告に積む。
5. **CR 除去**: 全 `\r` を削除(原典はテキストモード読込で CR が消える。パーサは LF のみを行区切りとするため必須の前処理)。

### 8.2 書き出しパイプライン(`encodeOudText`)

| 形式 | 手順 |
|---|---|
| .oud2 / .oud2backup | `TextEncoder().encode(text)` の先頭に `EF BB BF` を連結。text は §4.2 ② の時点で CRLF 済み |
| .oud / CSV(SJIS 選択時) | encoding-japanese: `Encoding.convert(Encoding.stringToCode(text), { to: 'SJIS', from: 'UNICODE' })` → `Uint8Array`。BOM なし |

- SJIS 変換不能文字は encoding-japanese の既定に任せず、変換前に**自前で CP932 可否を走査**(encoding-japanese の変換結果と原文字列の再逆変換比較)して `?` 置換 + `unmappableChars` 収集を行う。ユーザに黙って文字を落とさない。
- `TextDecoder('shift_jis')`(WHATWG)と原典 MSVC(CP932)のマッピング差は、実用上ほぼ現れない(NEC 特殊文字・IBM 拡張文字は WHATWG index が CP932 互換)が、差が出た場合はラウンドトリップコーパス(T1/T2)で検出される建付けとし、検出時は synthetic フィクスチャ化して個別対処する。

---

## 9. CSV 変換

- 対象: 時刻表 CSV(読み書き。FileType 行 `OuDiaSecond.JikokuhyouCsv.*` を持つ原典独自形式)、駅時刻表 CSV(書き出し)、カスタマイズ時刻表 CSV(書き出し)、運用表 CSV・運用一覧表 CSV(書き出し)。列構成・見出し(日本語固定)は原典実装(時刻表・カスタマイズ = `ConvJikokuhyouCsv/`、駅時刻表 = `ViewEkiJikokuhyou/CconvEkiJikokuhyouCsv`、運用系 = `ViewOperationTable/CconvOperationTableCsv`・`ViewAllOperationTable/CconvAllOperationTableCsv`)から各対応リリース(書き出し系 v0.2、時刻表 CSV 読み込み v0.5、カスタマイズ v0.6、運用系 v0.7。§1.1)の設計時に確定させる(本書では I/O 面のみ確定する)。
- **文字コード**: 読込は oud2 と同一の BOM 判定パイプライン(§8.1)を共用し UTF-8 / Shift_JIS 両対応。書き出しは **UTF-8 + BOM + CRLF を既定**とする(現行 Excel は BOM 付き UTF-8 CSV を正しく解釈する)。設定で Shift_JIS 書き出しも選択可(encoding-japanese、§8.2)。
- CSV は**バイト一致ゲートの対象外**(§1.2-4)。テストは「書出 → 読込 → 内部モデル等価」の意味論ラウンドトリップと、原典生成 CSV の読込互換のみとする。
- 実装は `csv/` に置き、format の他部分(node/ 等)には依存させない(CSV は OuPropertiesText 文法ではない)。

---

## 10. 性能目標と実測計画

アーキ §8.1「数 MB 級 oud2 の読込 1 秒以内」を次のように分解する。ベンチフィクスチャは sample.oud2(1.1MB、実在の大規模ファイル)を使う。

| 段 | 目標(sample.oud2) | 備考 |
|---|---|---|
| decodeOudText | < 50ms | TextDecoder + 単一パス走査 |
| parsePropertiesText | < 200ms | 単一パス・非正規表現 |
| reader(current) | < 300ms | EkiJikoku/Operation 逐次スキャン含む |
| writeOud2 全段 | < 300ms | 自動バックアップの許容予算を兼ねる |
| 合計(読込) | < 600ms | 目標 1 秒に対しマージン確保 |

- Vitest bench(`vitest bench`)で上記を計測し、CI で記録・前回比 +30% で警告、+100% で fail とする。
- 文字列連結は配列 push + 単一 join。数 MB 級で GC スパイクが観測されたらチャンク化を検討する(現時点では単純実装を優先)。

---

## 付録 A: リリース段階との対応

| リリース | 本書の実装範囲 |
|---|---|
| v0.1 | §3 パーサ全段 + §6.1/6.2 全世代リーダー + §7.1–7.5(開く系のみ)+ §8.1 |
| v0.2 | §4 シリアライザ + §5 黄金テスト CI ゲート + §6.3 .oud 書き出し + §7.6 バックアップ/復元 + §7.7 + §8.2 + セルフチェック機能 + §9 時刻表 CSV・駅時刻表 CSV 書き出し |
| v0.5 | §9 時刻表 CSV 読み込み |
| v0.6 | §9 カスタマイズ時刻表 CSV |
| v0.7 | §9 運用表 CSV・運用一覧表 CSV |

## 付録 B: 原典ソース対応表

| 本書 | 原典 |
|---|---|
| decodeOudText / encodeOudText | `libs/OuLib/Str/vectorToFile.cpp`(stringFromFile / stringToFile / stringToFileANSI) |
| node/(parse / serialize) | `libs/OuLib/Str/OuPropertiesText/CConvNodeContainer.cpp` ほか CNode/CDirectory/CPropertyString |
| reader/current + schema/ | `entDed/CconvCentDed.cpp`、`DedRosenFileData/CconvCdDedDispProp.cpp` |
| reader/s09 / s05 / s00 | `entDed/CconvCentDedS09.cpp` / `S05.cpp` / `S00.cpp` |
| reader/fileType | `DedRosenFileData/CconvCDedRosenFileData.cpp`(isEncodeAbleFormat) |
| writer/oud | `DedRosenFileData/CconvCDedRosenFileDataOud.cpp` + `entDed/CconvCentDedOud.cpp` |
| value/jikoku | `entDed/CdDedJikoku.{h,cpp}`(g_CdDedJikokuConv: NoColon / ZeroToNone / NotIfZero) |
| value/color / font | `libs/DcDrawLib/DcdCd/DcDrawProp/CconvDcDrawProp.cpp` |
| §7.6 自動バックアップ | `CDiagramEditDoc.cpp`(backup()、iBackupIntervalSecond=60、`元名_yyyymmddhhmm.oud2backup`) |
| csv/ | `ConvJikokuhyouCsv/`(CconvJikokuhyouCsv / CconvJikokuhyouCustomizeCsv) |
