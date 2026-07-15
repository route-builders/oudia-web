# アーキテクチャ設計

本書は OuDiaSecond(ver2.06.23 相当)を Web アプリケーションとして再実装するためのアーキテクチャ設計書である。3 案コンペと審査により確定した最終方針(案 3 incremental を基盤に、案 1 compat-first の互換規律と案 2 modern-web の内部品質要素を統合)を設計として具体化する。

ソース分析の詳細は `docs/analysis/01_codebase-overview.md` 〜 `08_manual-features.md` を参照。本書ではそれらを「分析 §01」〜「分析 §08」と略記する。

---

## 1. 決定事項サマリ

### 1.1 前提条件(再掲)

| 項目 | 内容 |
|---|---|
| 動作形態 | ブラウザで動作、インストール不要。PWA により完全オフライン動作 |
| ファイル互換 | .oud2 の読み書き**バイト互換**が最上位制約。OuDia .oud および旧版 oud2(1.00〜1.16 / OuDia.1.02)の読み込み互換 |
| ライセンス | GPLv3 派生物として GPLv3 で公開 |
| UI | 日本語。既存ユーザのキーボード操作体系を踏襲しつつ Web らしい改善は歓迎 |
| 性能 | 数百列車 × 数十駅規模で時刻表編集・ダイヤ描画が快適 |
| サーバ | 不要(クライアント完結)。ファイル共有・共同編集は将来拡張の余地として残す |
| 開発体制 | 個人開発・段階的リリース |

### 1.2 技術スタック(確定)

| 領域 | 採用 | 備考 |
|---|---|---|
| 言語 | TypeScript(strict、`exactOptionalPropertyTypes` 有効) | 時刻は `Seconds` ブランド型 + `null`(INT_MIN 全廃) |
| UI フレームワーク | React 18 + Vite | React はシェル UI(メニュー・路線ツリー・タブ・ダイアログ)のみ |
| UI ライブラリ | **不採用**(Radix 等を使わない) | ダイアログはネイティブ `<dialog>` + 自前フォームフック `usePropEdit` |
| 状態管理 | Zustand + Immer(`produceWithPatches`) | 単一チョークポイント `executeCommand()` |
| Undo/Redo | **patch 方式**(Immer のパッチ/逆パッチ) | 逆コマンド方式(createUndoCmd)は棄却 |
| 内部モデル | **ファイル形式と同型の index 参照モデル**(ID 化しない) | .oud2 互換の検証可能性を最優先 |
| Worker 通信 | Comlink(Apache-2.0) | 運用探索・交差支障のみ Worker 実行 |
| 描画 | Canvas 2D(ダイヤグラム 4 レイヤ / 時刻表グリッド自前実装) | DOM 仮想化グリッド・WebGL は不採用 |
| PWA | vite-plugin-pwa(Workbox) | 全アセット precache で完全オフライン |
| 文字コード | 読み = `TextDecoder('shift_jis')`、.oud / CSV(SJIS 選択時)の書き出しのみ encoding-japanese(MIT) | .oud2 書き出しは UTF-8+BOM で標準 API のみ |
| 永続化補助 | idb(ISC)、自動バックアップ本体は OPFS | |
| バリデーション | zod **不採用** | format の寛容読込規則(非数→0、範囲外 index→主本線補正)が事実上の検証層 |
| テスト | Vitest(format/domain/derive は Node 実行)+ Playwright(キーボード E2E) | **実ファイル群の「読込→書出→バイト一致」黄金テストを CI 必須ゲート**とする |
| リポジトリ | pnpm workspaces のみ(Turborepo 不採用) | ロックファイル固定 + Renovate。全依存 GPLv3 互換ライセンスのみ |

### 1.3 方式決定の一覧

| 論点 | 決定 | 出所 |
|---|---|---|
| 内部モデル | index 参照モデル(ファイル同型)。駅作業のみ判別可能ユニオンへ正規化 | 案 3 + 案 2 |
| Undo/Redo | patch 方式。履歴に `{コマンド型, パラメータ, patches, inversePatches}` を保存 | 案 2 |
| ビュー差分更新 | 原典 pHint 同様「コマンド型」でディスパッチ(パッチのパス解析はしない) | 統合案 |
| ダイヤグラム描画 | Canvas 2D × 4 レイヤ + rAF 全再描画 + ビューポートカリング | 案 2 + 案 3 |
| entDgr レイアウト | 純関数 `computeDiagramLayout` として**仕様書通り忠実移植**(再発明しない) | 案 3 |
| 時刻表グリッド | Canvas 自前グリッド(CWndDcdGrid 相当)。CCellBuilder 群 2.4 万行は `cellSpec` 純関数に圧縮 | 案 3 + 案 2 |
| ファイル I/O | 独立パッケージ `@oudia/format`。出力条件はテーブル駆動。SJIS 0x5C 救済ハック再現。未知キー保持・書き戻し | 案 2 + 案 1 |
| WindowPlacement | 読込時に保持し書き出し時に透過的に書き戻す(Windows 版との往復でファイルを壊さない) | 案 1 |
| 運用探索 | Web Worker で忠実直訳(独自再設計しない)。導出値はストア外キャッシュに分離 | 案 3 + 案 2 |
| リリース | v0.1 ビューア → v0.8 の 8 段階(§2.6 参照は本書 §3.5) | 案 3 |

---

## 2. 検討の経緯

3 つの方針案を立てて比較審査した。

- **案 1 compat-first**: 内部モデルをファイル形式と同型に保ち、C++ クラス構造(コマンド + createUndoCmd 逆コマンド、Undo 深さ 8)まで直訳する。互換の確実性は満点だが、TS としての保守負債(クラス直訳・逆コマンド実装義務の広いバグ面)を確定させる。
- **案 2 modern-web**: エンティティを ID 化・正規化し、純関数 + patch Undo で「あるべき Web アプリ」を目指す。内部品質は最良だが、index↔ID 変換層が新たな互換バグ源となり、仕様書のない運用探索 1 万行の純関数書き直しと合わせて個人開発の体力予算に合わない。
- **案 3 incremental**: 原典構造(index 参照モデル・コマンド単一チョークポイント・entDgr 導出層)を関数型に写像し、8 段階の最細リリース分割を取る。リリース分割が原典の `iEnableOperation` 分離線と一致しており設計根拠が最も強い。

審査結果は案 3 が最高得点(22.0 / 案 1: 18.5 / 案 2: 15.5)。ただし案 3 の弱点だった Undo 方式(逆コマンド)は案 2 の patch 方式に置き換え、互換規律(バイト一致 CI ゲート・0x5C ハック・WindowPlacement 書き戻し)は案 1 の厳密さを採用する。

**結論: 案 3 を基盤とし、案 1 の互換規律と案 2 の内部品質要素(patch Undo、判別可能ユニオン作業、導出値分離、テーブル駆動シリアライザ、宣言的セルレンダラ、4 レイヤ Canvas)を移植した統合案。**

設計判断の通奏低音は次の 2 点である。

1. **.oud2 バイト互換が最上位制約**である以上、内部モデルはファイルと同じ座標系(出現順 index 参照)で持つのが最も検証可能。ID 化の内部品質メリットは変換層の互換バグリスクに見合わない。
2. **仕様の一次情報がソースコードしかない**領域(運用探索、entDgr レイアウト、寛容読込規則)は、忠実移植を原則とし独自再設計をしない。「OuDia の見た目・挙動の同一性」こそが既存ユーザ移行の価値である。

---

## 3. 全体構成

### 3.1 モジュール構成(pnpm workspace)

```
oudia-second-web/
├── packages/
│   ├── format/    oud2/oud パース・シリアライズ・CSV 変換
│   │              (純文字列処理、DOM 非依存)
│   ├── domain/    エンティティ(index 参照・判別可能ユニオン作業)、
│   │              コマンドレデューサ群、整合カスケード、
│   │              時刻演算(24h 循環比較)、ソート/一本化
│   ├── derive/    entDgr レイアウト(computeDiagramLayout)、cellSpec、
│   │              運用探索(OperationConnecter)、交差支障判定
│   │              (原典でビュー内にあったドメインロジックを抽出)
│   └── render/    Canvas 描画プリミティブ、グリッド基盤、
│                  ダイヤ/時刻表/運用図レンダラ
└── apps/
    └── web/       React シェル、Zustand ストア、タブ管理、ダイアログ、
                   キーマップ、Worker ホスト、PWA
```

### 3.2 依存方向

```mermaid
graph LR
    format["@oudia/format<br/>(ファイル形式)"] --> domain["@oudia/domain<br/>(エンティティ・コマンド)"]
    domain --> derive["@oudia/derive<br/>(導出計算)"]
    derive --> render["@oudia/render<br/>(Canvas 描画)"]
    render --> app["apps/web<br/>(React シェル)"]
```

依存は **format ← domain ← derive ← render ← app の一方向のみ**。逆依存・循環依存は lint で禁止する。format / domain / derive は DOM 非依存であり、Node 単体で Vitest 実行できる(黄金テスト・プロパティテストの高速な回転が目的)。

### 3.3 各モジュールの責務

| パッケージ | 責務 | 原典対応 | 禁止事項 |
|---|---|---|---|
| `format` | OuPropertiesText 文法パーサ、世代別リーダー 4 系統、1.17 ライター、CSV 変換、エンコーディング判定 | CconvCDedRosenFileData / CconvCentDed(S00/S05/S09)/ CConvNodeContainer / CconvJikokuhyouCsv 群 | DOM・Zustand への依存。ドメインロジックの混入 |
| `domain` | `RosenFileData` 型の公開(型宣言の実体は format の model/ にあり、domain が re-export する。file-io §2.3)、コマンドレデューサ、整合カスケード(駅増減伝播・index 再マップ・adjustBrunchLoop・種別シフト)、時刻演算、ソート・一本化 | entDed 群 / CRfEditCmd 群 / CDedRessyaSoater / CRessyaContUnifier | 描画・UI 概念の混入。導出値のストア格納 |
| `derive` | ダイヤグラムレイアウト、セル仕様、運用探索、交差支障判定、駅時刻表バケツ分け | entDgr 群 / CDedOperationConnecter / CWndDcdGridCrossingCheck の判定部 / CCellBuilder 群(圧縮) | ドメイン状態の変更(入力→出力の純関数のみ) |
| `render` | Canvas 2D プリミティブ(線・矩形・テキスト・縦書き・回転)、座標変換、グリッド基盤(固定行列・フォーカス・選択)、各レンダラ | DcDrawLib / CWndDcdGrid / CDcdDiagram2 / CRessyaDraw | ストア直接参照(描画入力はすべて引数で受ける) |
| `apps/web` | シェル UI、ストアとコマンド実行、タブ管理、ダイアログ(`usePropEdit`)、キーマップ、File System Access、OPFS バックアップ、Worker ホスト、PWA | Hidemdi / CMainFrame / CDlgRosenView / CPropEditUi2 群 / CDiagramEditDoc | ファイル形式知識の混入(format に委譲) |

### 3.4 原典アーキテクチャとの対応

原典の Hidemdi モデル(非表示ルート Doc + 12 種のサブ Doc/View)は次のように写像する。

| 原典 | Web 版 |
|---|---|
| CDiagramEditDoc(ルート Doc、全データ保持) | Zustand ストア(`readonly RosenFileData` + 履歴) |
| CRfEditCmd 派生 + executeEditCmd() | 名前付きコマンド + `executeCommand()`(単一チョークポイント) |
| createUndoCmd() による逆コマンド | Immer `produceWithPatches` の逆パッチ |
| UpdateAllSubDocviews + pHint(コマンド型で部分更新) | ストア購読 + コマンド型ディスパッチによるビュー差分更新 |
| サブ Doc の DocStr(「ダイヤ名\n方向\nフラグ」)と二重オープン防止 | ビュー記述子 `{type, diaName, houkou, customizeFlag}` をキーとするタブ管理 |
| ダイヤ削除時のサブ Doc 強制クローズ | ストア購読でビュー記述子の整合性検証 → 自動クローズ |
| DcDrawLib(IfDcdTarget / IfDcDraw / CGdiCache) | render パッケージの Canvas プリミティブ + 座標変換層 |
| CPropEditUi2(StartEdit / OnUiChanged / EndEdit) | `usePropEdit` フック + ネイティブ `<dialog>` |
| .ini(ズーム・表示トグル) | localStorage |
| 60 秒自動バックアップ | OPFS 世代保存(編集契機、原典仕様踏襲) |

### 3.5 リリース段階

個人開発で段階的に価値を出すため、8 段階でリリースする。分割線は原典の `iEnableOperation`(運用機能 0=無効/1=簡易/2=通常)による機能分離と一致しており、v0.1〜v0.6 は運用機能なしで完結する。

1. **v0.1 ビューア(MVP)**: oud2/oud 全世代読込 → 時刻表・ダイヤグラム・駅時刻表の閲覧 + PWA オフライン。「スマホでダイヤが見られる」単独価値。
2. **v0.2 ラウンドトリップ保存**: 無編集完全再保存(バイト一致 CI ゲート稼働)+ コメント編集 + 自動バックアップ/クラッシュ復元。**互換の信頼をここで確立する。**
3. **v0.3 列車編集**: 列車配列範囲置換コマンド + patch Undo/Redo + 駅時刻・列車プロパティダイアログ + 列単位コピペ(貼り付け移動量含む)。
4. **v0.4 入力効率(価値の中核)**: 連続入力モード、時補完(±1 時間補正)、繰上げ/繰下げ伝播、連続 1 分修正(Ctrl+J=−1分し次へ / Ctrl+L=+1分し次へ)とフォーカス移動(Ctrl+K=次へ / Ctrl+Shift+K=前へ)、駅時刻変更再実行(ピリオド)、並べ替え、直通化/分断/一本化。Playwright キーボード回帰テスト整備。
5. **v0.5 構造編集**: 駅・種別・ダイヤ編集と整合カスケード(index 再マップ・分岐環状 adjust)、路線プロパティ、路線ファイル組入れ/切り出し。
6. **v0.6 番線・在線表・カスタマイズ時刻表**。
7. **v0.7 運用機能**: iEnableOperation 0→1→2 の順に、探索 Worker・運用表/一覧/一覧図(一覧表と一覧図は 1 ビューモデル + 2 レンダラで統合)・箱ダイヤ・入出区連携コード一覧。
8. **v0.8 以降**: 交差支障チェック、パターンダイヤプレビュー、印刷仕上げ、静的リンク共有 → 将来の CRDT 検討。

---

## 4. ドメイン層の設計方針

### 4.1 エンティティ: index 参照モデル(ファイル同型)

**内部モデルはファイル形式と同型の index 参照モデルとし、ID 化しない。** oud2 の全参照(種別・番線・駅・ダイヤ)は「出現順 0 起点 index」であり、index 補正規則・adjust 連鎖・作業入れ子をファイルと同じ座標系で扱うことがバイト互換の検証可能性を最大化する。

所有構造は原典を踏襲する。

```
RosenFileData
└── rosen: Rosen
    ├── ekiCont: Eki[]                      // 駅(出現順 = 駅 Index)
    │   ├── ekiTrack2Cont: EkiTrack2[]      // 番線
    │   ├── outerTerminalCont: OuterTerminal[]
    │   └── crossingCheckRuleCont: CrossingCheckRule[]
    ├── ressyasyubetsuCont: Ressyasyubetsu[] // 種別
    └── diaCont: Dia[]                       // ダイヤ(名前一意)
        └── ressyaCont: [Ressya[], Ressya[]] // [0]=下り / [1]=上り
            └── ekiJikokuCont: EkiJikoku[]   // 常に駅数と同数
                ├── beforeOperationCont: BeforeOperation[]
                └── afterOperationCont: AfterOperation[]
```

原典から変更する点(案 2 から採用した内部品質改善)は次の 3 つに限定する。

1. **駅作業は判別可能ユニオンへ正規化する。** 原典の汎用スロット(BoolData1-2 / IntData1-3 / JikokuData1-3 / OperationNumber1-3 / InOutLinkCode、意味が作業種類で変わる共用体的設計)を、前後 × 7 種(入換・増結・解結・出区/入区・路線外始発/終着・前/次列車接続・運用番号変更)の discriminated union にする。増結・解結の入れ子(相手編成の作業コンテナの再帰保持)は型で表現する。format 層がユニオン ↔ スロット列のマッピング(原典ヘッダの Doxygen 対応表準拠)を担う。

   ```typescript
   type BeforeOperation =
     | { kind: 'shunt'; /* 入換: 移動元番線, 時刻, ... */ }
     | { kind: 'connect'; formation: BeforeOperation[]; /* 増結: 入れ子 */ ... }
     | { kind: 'release'; ... }
     | { kind: 'out'; operationNumbers: string[]; inOutLinkCode?: string; ... }
     | { kind: 'outerStart'; ... }
     | { kind: 'junction'; ... }
     | { kind: 'numberChange'; ... };
   ```

2. **導出値は型レベルで分離する。** 運用探索が書き込む値(割当運番・接続時刻・接続方向・OperationTableContent・CustomizeJikokuhyouContent・InOutLinkCodeContent)は手入力値と混在させず、ストア外の導出キャッシュ(`derive` の出力)に置く。ストア内の `RosenFileData` は常に「ファイルに書かれる手入力値」のみを持つ。

3. **INT_MIN → null。** 時刻は `type Seconds = number & { __brand: 'Seconds' }` のブランド型 + `null`。番線未設定(m_iRessyaTrackIndex の INT_MIN)等も `null` に統一する。

### 4.2 時刻演算

`domain` パッケージの純関数として忠実移植する。

- 時刻は 0..86399 の秒。日付概念なし・24 時間サイクリック(25:00 は 1:00 として保持)。
- **`compareJikoku(a, b, kitenJikoku)`**(CdDedJikoku::compare 相当): 路線のダイヤグラム起点時刻を最小とみなす循環比較。ソート・運用接続・駅時刻表のバケツ分けすべてがこれに依存する。
- `subJikoku(a, b)`: 差を「絶対値 12 時間以下の側」で返す。
- decode(時刻文字列解釈): `'915'` = 9:15、`'1315'` = 13:15、`'131545'` = 13:15:45、コロン付き許容、末尾から 2 桁区切り。原典同様、範囲外(0≤時<24、0≤分/秒<60 を満たさない)はエラーとする(CdDedJikoku::decode の -2 相当。原典が読込エラーにするファイルを黙って受理しない)。
- 整数値からの時刻構築(setTotalSeconds / コンストラクタ相当): mod 86400 正規化 + 負値補正(-1 は 23:59:59)。CdDedJikoku::adjustTotalSeconds 相当で、decode とは別の経路。

### 4.3 状態管理: 単一チョークポイント

原典の「getCDedRosenFileData() は const のみ返し、変更は必ず CRfEditCmd を executeEditCmd() に渡す」規律をそのまま写像する。

- ストアは `readonly RosenFileData` を公開する。
- 変更は必ず**名前付きコマンド(型 + パラメータ)**を `executeCommand(cmd)` に渡す。

```typescript
type EditCommand =
  | { type: 'ressya/replaceRange'; diaIndex: number; houkou: 0 | 1;
      index: number; deleteCount: number; ressyas: Ressya[] }   // CRfEditCmd_Ressya 相当
  | { type: 'ressya/swap'; ... }                                 // CRfEditCmd_RessyaSwap
  | { type: 'eki/replaceRange'; ... }                            // CRfEditCmd_Eki
  | { type: 'syubetsu/replaceRange' | 'syubetsu/swap'; ... }
  | { type: 'dia/...' | 'diaProp/...' | 'rosen/...' | 'comment/set'; ... }
  // ...

function executeCommand(cmd: EditCommand): void {
  const [next, patches, inversePatches] =
    produceWithPatches(store.rosenFileData, draft => commandReducers[cmd.type](draft, cmd));
  // 1) 状態置換 2) 履歴追加(Redo スタッククリア) 3) 変更カウンタ更新
  // 4) コマンド型をヒントとしてビュー購読者へ通知 5) 60 秒経過なら OPFS バックアップ
}
```

- **コマンド本体は Immer の draft に対する命令的レデューサ**とする。C++ の execute() 実装(駅増減伝播・index 再マップ・adjustBrunchLoop・種別シフトの整合カスケード)をほぼ直訳できることが狙いであり、純関数の decompose に時間を使わない。
- 整合カスケードは domain 内の関数(draft Rosen に対する一連の adjust 呼び出し)に閉じ込める。駅編集の実行順序は原典に忠実: erase/set/insert → adjustBrunchLoop → 駅時刻形式正規化(adjustByEkijikokukeisiki)→ 番線・路線外駅の旧→新 index 対応表(-1 = 削除)による全ダイヤ全列車の番線再マップ → 交差支障ルール調整 → 作業調整。原典で末尾にあった OperationConnect(運用再探索)はレデューサから切り離し、コマンド完了後に Worker へ非同期依頼する(§4.6)。
- ホットパス(駅時刻配列の一括シフト等)は実測の上で手書き構造共有更新に差し替えられるよう、レデューサのインターフェースは関数単位に保つ(リスク §9.5)。

### 4.4 Undo/Redo: patch 方式

**逆コマンド方式(createUndoCmd)は採用しない。** Immer の `produceWithPatches` でパッチ/逆パッチを記録し、Undo = 逆パッチ適用、Redo = パッチ適用とする。これにより:

- 各コマンドに逆コマンド生成を正しく実装する義務(原典最大級のバグ面)を全廃する。
- Redo が「元コマンドの再 execute」でなくなるため、コマンドの決定性要件も消える。
- 原典の CRfEditCmd_Eki が持っていた「駅時刻が失われる編集は Rosen 全体を Undo 用に保存する」という分岐も不要になる(パッチが必要最小限の差分を自動で持つ)。

履歴エントリの形:

```typescript
interface HistoryEntry {
  command: EditCommand;          // コマンド型 + パラメータ(ビュー更新ヒント・将来の操作ログ)
  patches: Patch[];
  inversePatches: Patch[];
}
```

- **ビュー差分更新は「コマンド型」でディスパッチする**(原典の pHint と同じ考え方)。パッチのパス解析による更新範囲推定は行わない(案 2 の自認した弱点をここで解消)。例: `ressya/replaceRange` → 時刻表ビューは該当列のみ再構築、`eki/*` → 全ビュー再構築。
- Undo 深さは既定 100(原典の 8 固定から拡張)・設定可変。
- 変更カウンタは原典仕様を踏襲: 保存で 0、変更/Redo で +1、Undo で -1、負の状態から編集したら INT_MAX(「保存後に Undo してから編集した」ケースで未保存扱いを維持する仕様)。

### 4.5 UI 状態の完全分離

- ドキュメント状態(RosenFileData)と UI 状態(開いているタブ・ズーム・表示トグル)はストアを分ける。
- タブは**ビュー記述子 `{type, diaName, houkou, customizeFlag}`**(原典 DocStr と同型)をキーに管理する。同一記述子の二重オープン防止(CHidemdiDoctmplDocstrAlone 相当)と、ダイヤ削除時の該当タブ自動クローズ(UpdateAllSubDocviews の整合性検証相当)をストア購読で実装する。ダイヤ参照は名前照合(findCentDedDiaByName 相当)。
- ズーム・表示トグル(約 12 種、原典 .ini 永続化)は localStorage。
- **oud2 内の WindowPlacement ノードは読込時に未解釈のまま保持し、書き出し時に透過的に書き戻す。** Web 版ではウインドウ配置として利用しないが、Windows 版と往復してもファイルを壊さない(案 1 の規律)。

### 4.6 運用探索・交差支障(Worker)

- 運用探索(CDedOperationConnecter、cpp 10,247 行)は `derive` の純関数として移植し、**Web Worker(Comlink)で実行**する。アルゴリズム(駅 × 番線の時刻順在線リスト、出区/路線外始発起点の運番伝播、接尾辞 ";n" による重複区別と除去、競合解決順序、簡易/通常/パターンダイヤの 3 モード)は**ソースからの忠実移植とし、独自再設計しない**。
- 編集コマンド完了ごとにダイヤ単位で再探索を依頼し、完了まで**前回結果を表示し続ける**(UI をブロックしない)。原典の「更新一時停止 + F5 手動更新」に相当する制御も提供する。
- 探索成果(運番 → OperationTableContent リスト、カスタマイズ時刻表表示、入出区連携コード集計)は導出キャッシュに格納し、運用表・一覧表・一覧図・時刻表の運用行がこれを購読する。
- 交差支障判定(原典ではビュー内 OnUpdate_All() に実装)は `derive` へ抽出し、同じく Worker 実行する。判定式「前動作時刻 + 下限 <= 後動作時刻 < 前動作時刻 + 上限」、動作抽出(停車着発・通過・入換・路線外、分岐環状同一駅群を含む)、2 ポインタの時隔窓列挙を移植する。原典同様、自動更新はせず明示実行とする。

---

## 5. レンダリング戦略

### 5.1 ダイヤグラム: Canvas 2D、4 レイヤ重畳

`<canvas>` を 4 枚重ね、更新頻度の異なる描画を分離する。

| レイヤ | 内容 | 再描画契機 |
|---|---|---|
| 1(最背面) | 背景色(基本 + 駅間個別)・縦罫線(8 択テーブル {1,2,5,10,15,20,30,60 分}、bold/middle/dot)・横罫線(主要駅 = 太線)・時ラベル・駅名欄 | スクロール・ズーム・リサイズ・駅/表示設定変更 |
| 2 | スジ(列車線)・在線表運用線 | レイアウト再計算・スクロール・ズーム・リサイズ |
| 3 | 列車ラベル(回転)・停車駅明示 ○・入出区記号 | 同上 |
| 4(最前面) | 選択・ホバーのオーバレイ | ポインタ移動(このレイヤのみ高頻度) |

各 Canvas はビューポートサイズ(ダイヤ全体サイズの巨大 Canvas は作らない)とするため、スクロール / ズーム / リサイズは L1〜L3 全レイヤの再描画契機になる(詳細は 06_rendering §1.2)。

- 描画は requestAnimationFrame での全再描画 + **ビューポートカリング**(CEnumRessyasen 相当: 描画領域と交差する列車線のみ列挙)。原典の ScrollWindow 部分スクロール・OpenMP 並列・Y キャッシュは移植せず、この単純化で置換する。
- **レイアウト計算は純関数 `computeDiagramLayout(rosen, diaIndex): DiagramLayout`** として entDgr パイプラインを仕様書(分析 §05)通り忠実移植する。ここが OuDia の見た目の同一性の核であり、再発明しない。
  - DgrX = 午前 0 時からの経過秒(86400 超・負を許容)。左端 = ダイヤグラム起点時刻、横幅は常に 24 時間分。
  - DgrY = 秒単位の駅間幅 = 駅間最小所要秒数(下り/上り最短の小さい方)。駅の手動値 NextEkiDistance 優先、列車なし駅間は既定 60 秒。
  - スジ構築: 直前非 null 時刻との**差分累積**による X 座標化(日跨ぎで自然に 86400 超)→ ラベル描画駅決定 → 経由なし区間端の補完 → **長時間停車の補完**(前駅発 + 最小所要秒 < 当駅発 - 60 秒なら着時刻を補い水平線化)→ 折れ線分割(停車駅・時刻あり主要駅/通過駅・経由なし・在線表表示駅で折る、**補間位置と実時刻が 60 秒以上ズレる中間駅で折り直す**)。中間駅 X は駅間 Y 距離比の線形補間。
  - `createEstimateRessya`(列車線から中間駅の推定時刻を逆生成)も移植し、時刻表ビューの通過時刻推定・乗継ソートと共有する。
- 回転ラベルは `ctx.rotate`(GDI lfEscapement 相当)でスジの実傾きに沿わせ、始発駅(または「常に表示」設定駅)の発時刻位置の線上側に描く。日跨ぎ・24 時間繰り返しは ±86400 秒シフトの重複描画。
- **ズームは原典同様「表示 Dgr 範囲の離散増減」**(X = 30 分単位 / Y = 全体の 1/10 単位、X/Y 独立、Y 全体表示リセットあり)。倍率型ズームにしない。
- WebGL は不採用。ただし **座標変換層(CconvContentPosToTarget 相当の線形変換)を挟み**、描画バックエンドの将来差し替え可能性のみ確保する。
- 原典同様、ダイヤグラムビューは表示専用(ドラッグでの時刻修正・スジ引きなし)。列車線ダブルクリック(線分と点の距離ヒットテスト)→ 時刻表ビューへ遷移、駅名欄ダブルクリック → 駅プロパティ。

### 5.2 時刻表グリッド: Canvas 自前グリッド

DOM 仮想化グリッドは不採用とし、CWndDcdGrid 相当の Canvas グリッド基盤を `render` に実装する。

**不採用理由**: (1) 種別別フォント / 文字色 / 背景色・縦書き(列車名・備考)・「ﾚ」「||」「・・」「----」「○」「====」等の記号忠実度、(2) 数百列 × 重セル書式での確実な 60fps、(3) 印刷描画とのコード共用。原典には**セル直接タイプが存在しない**(キー押下 → ダイアログへ転送する CKeyinputSenderToModalDlg 方式)ため、「Canvas はテキスト入力に弱い」という一般的弱点がこのアプリでは刺さらない。

- グリッド基盤の提供機能: 固定行列(駅名 + 着発の固定 2 列、ヘッダ固定行)、フォーカスセル、箱型選択(Shift)・ランダム選択(Ctrl)、キーボードナビ、自動スクロール、セル単位の部分再描画。
- 列 ⇔ 意味の対応は原典の ColSpec 方式(CdXColSpecCont / CdYColSpecCont)を踏襲: X = [0:駅名, 1:着発, 2..:列車, 末尾:新規列車追加位置]、Y = ヘッダ部(列車番号/運用番号 × 段数/種別/列車名/号数/号/始発終着駅名/駅作業)+ 駅ごと(着・入線・前作業・番線・後作業・発)+ 路線外終着/備考。行の有無は駅プロパティとビュートグルで決まり、非表示行への参照は代替行に解決する。**可視域のみの ColSpec 遅延評価**で数百列規模に耐える。
- **CCellBuilder 群(通常 + カスタマイズで計 2.4 万行)は移植しない。**「`cellSpec(row, col, state): CellSpec` を返す純関数(`derive`)+ 宣言的レンダラ(`render`)」に圧縮する。CellSpec はテキスト・書式(フォント index・文字色・背景色・縦書き・整列)・記号種別を宣言的に持つ。
- 表示書式は原典既定を踏襲: 時刻はコロンなし・時先頭ゼロはスペース・秒非表示(秒表示/コロン/24 時超/着発別秒丸めオプションあり)、通過「ﾚ」(灰 128,128,128)、経由なし「||」、運行なし「・・」(主要駅「----」)、時刻なし停車「○」、終着後「====」、運休列車は灰色背景。
- **IME 入力**: フォーカスセル位置に単一の DOM オーバーレイ(透明 input)を重ね、キー押下時は「初期文字列付きダイアログ起動」(CKeyinputSenderToModalDlg の代替)で原典の操作感を再現する。連続入力モード(Ctrl+T、分 2 桁連続タイプ)はオーバーレイ input で処理する。
- 駅時刻表ビュー・運用系グリッド・駅/種別ビューも同一グリッド基盤上に実装する。

### 5.3 印刷

同一描画コード(render のレンダラ)を OffscreenCanvas でページ分割し、ブラウザ印刷 / PDF に流す。原典が「画面用描画コードを DPI スケールで印刷流用」していた構図(CaDcdTargetZoomDisplay)を座標変換層で再現する。優先度は Tier4(v0.8 以降の仕上げ)。

---

## 6. ファイル I/O

### 6.1 `@oudia/format` パッケージ

純文字列処理の独立パッケージ。構成:

1. **OuPropertiesText 文法パーサ**(約 100 行相当、全世代共通)
   - 前処理: **CR 除去**(原典パーサは LF のみを行区切りとするため必須)→ BOM 判定 → UTF-8 / Shift_JIS デコード。
   - 行種別: 空行 = 無視 / "." のみ = ディレクトリ終端 / '=' を含まず末尾 '.' = ディレクトリ開始 / それ以外 = プロパティ(最初の '=' で分割、'=' なしは値空)。
   - エスケープは `\n`(LF)と `\\` の 2 種のみ。未知のエスケープはそのまま保持。
   - 同名キーの繰り返し + 出現順が正規表現(Eki.×n、JikokuhyouFont×8、DiaBackColor×5 等)。ノードツリーは出現順を完全保存する。
2. **世代別リーダー 4 系統**(FileType で振り分け、isEncodeAbleFormat 相当)
   - 1.10–1.17 → 現行リーダー / 1.06–1.09 → S09 / 1.01–1.05 → S05 / 1.00・OuDia.1.02 → S00 / 他はエラー(負のエラーコード体系 + 詳細蓄積を踏襲)。
   - 旧版差分の変換(S05 の RessyaTrack/OperationNumber 別キー → 現行 Operation/EkiJikoku への変換、S00 の Kyoukaisen による分岐推定、旧駅扱 3 = 経由なし → 0 変換)を各リーダーが担う。
3. **現行 1.17 ライター**
   - 出力規則(「true のみ出力」「非デフォルト時のみ出力」「同名キー出現順」「時刻書式: コロンなし・時先頭ゼロなし・秒 0 省略」「色 = COLORREF %08X(0x00BBGGRR)」「フォント = ';' 区切り Key=Value」「範囲外 index → 主本線補正」)は、分析 §03 の §5 仕様表から**テーブル駆動**で実装する。キーごとの {型, デフォルト値, 出力条件, 順序} を宣言テーブルに持ち、コードと仕様の乖離を構造的に防ぐ。
   - EkiJikoku(「駅扱[;着/発][$番線idx]」のカンマ連結、始発前は空要素・終着後は省略、上りは上り方向駅順)と Operation(「Operation{駅Order}B|A」キー、入れ子は「親.idxB|A」、種類番号 + '/','$' 交互固定順パラメータ、区切りエスケープなし)は逐次スキャンで実装する。
   - ルート末尾に `FileTypeAppComment=<アプリ名> Ver. <版>` を付加(読込では未使用)。この行のみバイト一致検証の例外とする(§7.1、`docs/design/04_file-io.md` §4.4)。
4. **寛容読込規則**(zod の代わりの事実上の検証層)
   - 非数 → 0 / デフォルト、範囲外 index → 0 または主本線(下り DownMain / 上り UpMain)補正、Houkou 不明の Ressya は黙って無視。
   - **SJIS 0x5C 救済ハックを再現する**: SJIS 読込時、2 バイト目が 0x5C の文字直後の '\' を 1 文字削除(壊れた旧ファイルの受け入れ。実装コストは小さく互換の信頼に直結)。
5. **未知キー・未知ノードの保持**
   - パース時に未知キー・未知ノードを位置情報付きで保持し、書き出し時に同位置へ書き戻す。将来版 OuDiaSecond ファイルとの共存と、WindowPlacement 透過書き戻し(§4.5)を同じ機構で実現する。
6. **CSV 変換**: 時刻表 CSV(双方向、日本語固定見出し)・カスタマイズ時刻表 CSV・運用表 CSV。

### 6.2 文字コード

| 方向 | 形式 | 実装 |
|---|---|---|
| 読み | UTF-8(BOM 有)/ Shift_JIS(BOM 無) | BOM の有無で判定(拡張子でなく)。デコードはブラウザ標準 `TextDecoder('shift_jis')` / `TextDecoder('utf-8')` |
| .oud2 書き | UTF-8 + BOM + CRLF | 標準 API(TextEncoder + BOM 前置) |
| .oud 書き | Shift_JIS + BOM なし + CRLF | encoding-japanese(MIT)。ブラウザに SJIS エンコーダがないため |
| CSV 書き | UTF-8 + BOM + CRLF を既定。設定で Shift_JIS も選択可 | 既定は標準 API。SJIS 選択時のみ encoding-japanese |

.oud 書き出しは FileType=OuDia.1.02 の最小キー集合(Operation・番線・Canceled 等は喪失、Kyoukaisen は隣接駅の着形式から自動生成)とし、保存前に**機能喪失警告ダイアログ(文言も原典踏襲)**を出す。

### 6.3 ローカルファイルアクセス

- **File System Access API**(Chromium 系): 上書き保存・「最近使ったファイル」(FileSystemFileHandle を idb に永続化)。
- **フォールバック**(Firefox / Safari): `input[type=file]` で開く + ダウンロードで保存。
- **自動バックアップ**: 原典仕様(タイマーでなく編集コマンド契機、前回から 60 秒経過していれば実行)を踏襲し、保存先は OPFS に世代保存。起動時に未保存クラッシュを検出して復元を提案する。

### 6.4 互換セルフチェック機能

公開初期からアプリ内に「お手元の oud2 で開く → 保存 → 差分ゼロ確認」機能を組み込む。差分があった場合は匿名化した差分レポート(キー名・行番号のみ、値はマスク)の提出を任意で依頼し、互換テストコーパスを収集する(リスク §9.1 の軽減策)。

---

## 7. テスト戦略

### 7.1 ラウンドトリップ黄金テスト(CI 必須ゲート)

**最重要のテスト。** sample2.oud2 等の実ファイル群に対し「読込 → 無編集 → 書出 → 元ファイルとバイト一致」を検証する。v0.2 で CI の必須ゲートとして稼働させ、以後すべての PR がこれを通過しなければマージできない。

なお、通常保存では Web 版が自らのアプリ名・版を `FileTypeAppComment` に書く(§6.1-3)ため、バイト一致は **FileTypeAppComment 行を除く全バイト**で判定する。黄金テストでは書出時に元ファイルの FileTypeAppComment 値を注入(`appComment` オプション)して**完全バイト一致**で検証する(詳細は `docs/design/04_file-io.md` §4.4)。

- コーパス: 同梱 sample2.oud2 から開始し、旧世代ファイル(1.00〜1.16、OuDia.1.02)・運用/番線/分岐環状/カスタマイズ時刻表を含むファイル・§6.4 で収集した実ファイル(ライセンス許諾を得たもの)へ拡張する。
- 旧世代ファイルは「読込 → 1.17 書出」の期待値を Windows 版 OuDiaSecond で生成した結果と比較する(旧→新変換の互換検証)。
- バイト不一致時は最初の差分行・キーパスを報告するカスタムレポータを備える。

### 7.2 レイヤ別テスト

| 対象 | 手段 | 内容 |
|---|---|---|
| format | Vitest(Node) | 黄金テスト、文法パーサ単体(エスケープ・ディレクトリ判定・CR 除去・BOM 判定・0x5C ハック)、EkiJikoku/Operation スキャナ、テーブル駆動出力条件の網羅、CSV 往復 |
| domain | Vitest(Node) | 時刻演算(循環比較・decode・±12h 差)、コマンドレデューサ単体、**整合カスケードのプロパティベーステスト**(任意の駅追加削除・種別入替・番線再マップ後に「全列車の駅時刻数 = 駅数」「参照 index の全域有効性」等の不変条件を常設)、Undo/Redo(patch 適用の対称性、変更カウンタ仕様) |
| derive | Vitest(Node) | `computeDiagramLayout` の座標スナップショット(60 秒閾値・長時間停車補完・線形補間・日跨ぎの各境界ケース)、`cellSpec` スナップショット、**運用探索は Windows 版と同一入力 → 同一 OperationTableContent 出力の比較テストを移植前に用意**、交差支障の時隔窓判定 |
| render | Vitest + Canvas スナップショット | 主要ビューのピクセル/描画コマンド列スナップショット(回帰検知用、厳密一致は求めない) |
| apps/web | Playwright | **キーボード操作 E2E**(v0.4 で整備): 連続入力モード、時補完、繰上げ/繰下げ、Ctrl+J(−1分し次へ)/ Ctrl+L(+1分し次へ)/ Ctrl+K(フォーカスを次へ)、ピリオド再実行、コピペと貼り付け移動量。PWA インストール時/タブ表示時の両キーマップモードを検証。ファイル開閉・タブ管理・クラッシュ復元 |

### 7.3 テスト運用方針

- format / domain / derive は DOM 非依存の Node 実行で高速に回し、開発中は watch で常時実行する。
- 運用探索(v0.7)は「先にテスト、後に移植」: Windows 版で入出力ペアのフィクスチャを大量生成してから直訳を開始する。
- E2E は原典マニュアル 2.3 章(列車のいろいろな入力方法)をテストシナリオの一次ソースとする。

---

## 8. 非機能要件

### 8.1 性能目標

| 項目 | 目標 | 手段 |
|---|---|---|
| 対象規模 | 数百列車 × 数十駅のダイヤ | — |
| ダイヤグラムのスクロール/ズーム | 60fps | 4 レイヤ分離・ビューポートカリング・rAF |
| 時刻表グリッドのスクロール/編集反映 | 60fps / 編集反映 16ms 以内 | Canvas グリッド・可視域のみ ColSpec 遅延評価・コマンド型による列単位差分更新 |
| ファイル読込(数 MB 級 oud2) | 1 秒以内 | 逐次スキャンパーサ(正規表現多用を避ける) |
| 編集コマンド実行 | 通常操作 16ms 以内 | Immer 構造共有。一括操作のホットパスは実測の上で手書き更新に差し替え可能な構造(§4.3) |
| 運用探索 | UI 非ブロック(数百 ms 許容) | Worker 実行 + 前回結果表示 |

性能は推測でなく実測で管理する: 代表規模(500 列車 × 50 駅)のベンチマークフィクスチャを用意し、レイアウト計算・全再描画・コマンド実行の所要時間を CI で追跡する。

### 8.2 オフライン対応(PWA)

- vite-plugin-pwa(Workbox)で**全アセットを precache** し、初回訪問後は完全オフラインで動作する。ネットワーク必須の機能を作らない(クライアント完結原則)。
- 更新は Service Worker の新版検出 → ユーザへ再読み込みを提案(編集中の強制リロードはしない)。
- インストール(A2HS)を案内し、インストール時はキーマップを原典バインド既定に切り替える(§9.4)。

### 8.3 対応ブラウザ

| ブラウザ | 対応レベル |
|---|---|
| Chrome / Edge(Chromium 系、最新 2 メジャー) | フル機能。File System Access API による上書き保存・最近使ったファイル |
| Firefox(最新 2 メジャー) | フル機能(保存はダウンロード方式)。OPFS 自動バックアップは対応 |
| Safari 17+ | フル機能(保存はダウンロード方式)。OPFS・`TextDecoder('shift_jis')` 対応を前提 |
| モバイル(iOS Safari / Android Chrome) | v0.1 ビューア機能を第一級サポート(「スマホでダイヤが見られる」価値)。編集はキーボード前提のためベストエフォート |

「上書き保存の快適性は Chromium 系限定」であることをドキュメントに明記する。全ブラウザで「保存し忘れてもデータが残る」体験(OPFS バックアップ + クラッシュ復元)を保証する。

### 8.4 アクセシビリティ・その他

- Canvas グリッドの構造的制約(スクリーンリーダー・ブラウザ内検索不可)は受容しつつ、フォーカスセル内容の aria-live 通知と列車番号検索機能(原典の検索ダイアログバー相当)で部分補償する(§9.3)。
- 個人情報・テレメトリは収集しない(§6.4 の差分レポートのみ、明示的同意 + 匿名化)。
- UI 文言は日本語のみ(i18n 機構は当面導入しない)。

---

## 9. リスクと軽減策

### 9.1 ラウンドトリップ互換の再現漏れ(最大リスク)

出力条件・キー順序の漏れは実ファイルでしか発見できない。

- (i) v0.2 でバイト一致 CI ゲートを最優先整備する(§7.1)。
- (ii) §5 仕様表(分析 §03)のテーブル駆動実装でコードと仕様の乖離を構造的に防ぐ(§6.1)。
- (iii) 公開初期から「開く → 保存 → 差分ゼロ確認」機能をアプリ内に組み込み、匿名化差分レポートでコーパスを収集する(§6.4)。

### 9.2 運用探索(1 万行)の移植で息切れ

ソースが唯一の仕様であり、挙動差リスクと工数リスクが最大。

- v0.7 に隔離済みで、iEnableOperation=0 でも v0.1〜v0.6 が製品として完結する構成(§3.5)。
- 移植は再設計せず忠実直訳とし、**Windows 版と同一入力 → 同一 OperationTableContent 出力の比較テストを先に用意する**(§7.3)。
- Worker 実行 + 前回結果表示で、探索が数百 ms かかっても UI をブロックしない(§4.6)。

### 9.3 Canvas グリッドのアクセシビリティ・ブラウザ検索不可

構造的制約として受容する。部分補償として、フォーカスセル内容の aria-live 通知と、列車番号検索機能(原典の検索ダイアログバー相当)を提供する。

### 9.4 キーボードショートカットのブラウザ予約衝突

Ctrl+T(連続入力)/ Ctrl+J・Ctrl+L(連続 1 分修正)/ Ctrl+K(フォーカス移動)等がブラウザ予約と衝突する。

- PWA インストール時(standalone 表示)は原典バインドを既定とする。
- ブラウザタブ表示時は代替バインドを自動適用する。
- キーマップはユーザ設定可能にし、v0.4 の Playwright E2E で両モードを検証する。

### 9.5 Immer 全状態更新の GC 負荷

数百列車の一括操作(全列車シフト等)で patch 生成・構造コピーが嵩む可能性。

- 構造共有により通常操作は問題ないが、ホットパス(駅時刻配列の一括シフト)は実測の上で手書き構造共有更新に差し替えられるよう、コマンドレデューサのインターフェースを関数単位に保つ(§4.3)。
- 代表規模ベンチマークを CI で追跡する(§8.1)。

### 9.6 File System Access API の Firefox / Safari 非対応

フォールバック(ダウンロード保存)+ OPFS 自動バックアップにより「保存し忘れてもデータが残る」体験を全ブラウザで保証する。上書き保存の快適性は Chromium 系限定と明記する(§8.3)。

### 9.7 index 参照モデル温存による整合カスケードの複雑さ

ID 化を捨てた代償として、駅・種別・番線の増減のたびに全ダイヤ全列車の index 再マップが必要。

- カスケードを domain 内の関数(入力 Rosen → 出力 Rosen、draft ベース)に閉じ込め、UI 層に漏らさない(§4.3)。
- 駅追加削除・種別入替・番線再マップそれぞれに**プロパティベースのテスト**(全列車の駅時刻数 = 駅数、参照 index の全域有効性)を常設する(§7.2)。

---

## 10. ライセンス方針(GPLv3)

- 本プロジェクトは OuDiaSecond(GPLv3)の派生物であり、**全体を GPLv3 で公開する**。各ソースファイルにライセンスヘッダ、リポジトリに COPYING(GPLv3 全文)を置き、原著作者(OuDia: take-okm 氏、OuDiaSecond 作者)のクレジットと改変の告知を README / アプリ内「バージョン情報」に明記する。
- **Web アプリとしての頒布 = クライアントコードの頒布**である(JS がユーザのブラウザへ配布される)ため、GPLv3 §6 に基づき対応ソースの提供が必要。ビルド済みアセットとソースリポジトリの対応をリリースタグで管理し、アプリ内からソースリポジトリへのリンクを常設する。minify されたコードのみの配布はソース提供義務を満たさないため、公開リポジトリを Corresponding Source とする。
- **依存ライブラリは GPLv3 互換ライセンスのみ許可する**: React / Vite / Zustand / Immer(MIT)、Comlink(Apache-2.0)、encoding-japanese(MIT)、idb(ISC)等。Apache-2.0 は GPLv3 と一方向互換(同梱可)。依存追加時は CI のライセンスチェック(license-checker 等)で非互換ライセンス(GPL 非互換の独自ライセンス、CC-BY-NC 等)の混入を防ぐ。
- ロックファイル固定 + Renovate による依存更新でも、更新 PR ごとにライセンスチェックを通す。
- 分析ドキュメント・本設計書などのドキュメント類もリポジトリに含め、同一条件で公開する。
- 将来のファイル共有・共同編集サーバを設ける場合も GPLv3(ネットワーク越し利用に頒布義務はないが、プロジェクト方針としてサーバコードも公開する)。AGPL への移行は原典が GPLv3 である以上不可ではないが(GPLv3→AGPLv3 の組み合わせは可能)、現時点では単一ライセンス GPLv3 で統一する。

---

## 付録: 参照ドキュメント

| ドキュメント | 内容 |
|---|---|
| `docs/analysis/01_codebase-overview.md` | コードベース全体・Hidemdi・コマンドパターン・描画抽象 |
| `docs/analysis/02_domain-model.md` | エンティティカタログ(entDed/entDgr)・index 体系・整合処理 |
| `docs/analysis/03_file-format.md` | .oud2/.oud 形式仕様・§5 キー仕様表・世代差分 |
| `docs/analysis/04_view-jikokuhyou.md` | 時刻表ビュー・入力効率機能・駅時刻表ビュー |
| `docs/analysis/05_view-diagram.md` | ダイヤグラムビュー・entDgr パイプライン |
| `docs/analysis/06_view-others.md` | 路線・駅・種別・コメント・リンクコードビュー |
| `docs/analysis/07_view-operation.md` | 運用機能・運用探索・交差支障チェック |
| `docs/analysis/08_manual-features.md` | 機能インベントリ・Tier 分類・用語対応表 |
