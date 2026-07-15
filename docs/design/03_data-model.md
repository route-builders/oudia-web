# データモデル設計

本書は Web 版 OuDiaSecond の内部データモデル(`@oudia/domain` パッケージの型定義)の設計書である。`docs/design/02_architecture.md` で確定した方針(index 参照モデル・patch 方式 Undo・導出値の型レベル分離・INT_MIN 全廃)を型として具体化する。

原典の根拠は `docs/analysis/02_domain-model.md`(以下「分析 §02」)、ファイル形式は `docs/analysis/03_file-format.md`(以下「分析 §03」)。本書に登場する C++ 名はすべて `origin/DiagramEdit/DiagramEdit/entDed/` のものである。

---

## 1. 設計方針

### 1.1 C++ クラス構造の写像規則

原典のエンティティツリー(CentDedRosen をルートとする値コピー包含ツリー)を、**プレーンなオブジェクトツリー(POJO)にそのまま写像する**。正規化(ID テーブル化)はしない。

| 原典の機構 | Web 版での写像 |
|---|---|
| `CMuiCopiedParent<T>`(値コピー格納コンテナ) | プレーンな `T[]`(配列)。出現順 = index |
| 子 → 親の逆参照(`getParent()` / `getRosen()` 等) | **持たない**。走査は常にルート `RosenFileData` からのパス(index の組)で行う |
| `setable()` 事前検査 + `LException` | コマンドレデューサ内の事前検証(違反コマンドは実行前に拒否) |
| `adjust()` 連鎖(setParent 時の自己修正) | domain の整合カスケード関数(§8)。draft に対する明示的な関数呼び出し |
| クラスのメソッド(`getSihatsuEki()` 等) | domain の純関数(`getSihatsuEkiOrder(ressya)` 等)。データとロジックを分離 |
| 汎用データスロット(BoolData1/IntData1/JikokuData1…) | 判別可能ユニオン(§2.7)。format 層がスロット列 ↔ ユニオンの変換を担う |
| `INT_MIN` = Null、`-1` = 無効 | いずれも `null`(§1.3) |
| 導出値スロット(※印)・Dia の導出コンテナ | **ストアに持たない**。`@oudia/derive` の導出キャッシュ(§2.10) |

親逆参照を捨てられるのは、原典で親参照が必要だった局面(番線数の取得・種別の解決・起点時刻の参照)がすべて「ルートからの走査」で代替でき、かつ Web 版では変更が単一チョークポイント `executeCommand()` を通るため、部分木単独で整合を保つ必要がないからである。

### 1.2 命名方針

1. **型名**: C++ クラス名から接頭辞(`CentDed` / `Cd` / `C`)を除去する。`CentDedEki` → `Eki`、`CdDedJikoku` → `Jikoku`(型エイリアス)。
2. **フィールド名**: ハンガリアン記法(`m_str` / `m_i` / `m_b` / `m_e` / `m_jikoku` / `m_color`)を除去し lowerCamelCase にする。
3. **語彙はローマ字のまま英訳しない**(`ekimei` / `ressyabangou` / `syubetsu` …)。原典ソース・ファイルキー・分析ドキュメントとの突き合わせ可能性(バイト互換検証の作業効率)を最優先する。
4. **ファイルキーと C++ フィールド名が食い違う場合はファイルキー側に合わせる**。例: `m_strEkimeiJikokuhyouRyaku` はファイルキー `EkimeiJikokuRyaku` に合わせ `ekimeiJikokuRyaku` とする。ラウンドトリップ黄金テストのデバッグでファイルとモデルを 1:1 で照合できることが理由。
5. **コンテナは `〜Cont` サフィックスを維持**する(`ekiCont` / `diaCont` / `ekiJikokuCont`)。原典の `m_CentDedEkiCont` 等との対応を明示するため。
6. 列挙は TS の文字列リテラルユニオンとし、値名は原典 enum 値のローマ字部分を lowerCamel 化する(`Ekiatsukai_Teisya` → `'teisya'`)。ファイル上の数値・識別子文字列との対応表は format 層に置く(§5)。

### 1.3 Null 表現の統一

原典は「`INT_MIN` = Null 時刻・未設定番線」「`-1` = 分岐なし・親種別なし・Null 列車 Index」の 2 種の番兵を使い分ける。Web 版は**どちらも `null` に統一**する(アーキテクチャ §4.1 の決定を拡張適用)。

- `INT_MIN` 系: 時刻 Null、`m_iRessyaTrackIndex` 未設定 → `Jikoku = Seconds | null`、`ressyaTrackIndex: number | null`。
- `-1` 系: `m_iBrunchCoreEkiIndex` / `m_iLoopOriginEkiIndex` / `m_iParentSyubetsuIndex` / `CdDedRessyaProperty::m_iRessyaIndex` → `number | null`。
- **`0` がデフォルト値を意味するもの(`nextEkiDistance` = 0 で路線既定、種別 Index = 0 で既定種別)はそのまま `0`** とする。これらは「無効」ではなく有効値だからである。
- format 層が書き出し時に `null → -1 / キー省略 / 空文字列` の逆変換を行う(§6.3)。

### 1.4 ストアに入れるもの・入れないもの

`RosenFileData` は「**ファイルに書かれる手入力値のみ**」を持つ。次は入れない。

| 原典でエンティティが持っていたが除外するもの | 行き先 |
|---|---|
| 運用探索の導出値(作業の※印スロット: 割当運番・前列車接続時刻/方向・接続種別) | derive の `OperationCache`(§2.10) |
| `CentDedDia` の導出コンテナ(`m_contOperationTableContent` / `m_contCustomizeRessyaIndexKudari,Nobori` / `m_contInOutLinkCodeContent`) | 同上 |
| 分岐・環状の派生マップ(`m_iBrunchLoopPosition` / `m_iEkiIndexLoop` 等。ファイル非出力、駅編集の度に再計算) | domain の純関数 `deriveBrunchLoopMap()` の戻り値。構造共有により `ekiCont` の参照同一性をキーに memoize(§2.10) |
| `CentDedDia::m_bWaitOperationUpdate`(運用更新保留。ファイル非出力 — CconvCentDed.cpp で確認) | UI 状態ストア(ダイヤ名をキー) |
| `m_iPatternDiagramPreviewRange`(ファイル非出力 — 同上。出力されるのは Enable / CycleSecond のみ) | UI 状態ストア |
| `m_bKyoukaisen`(境界線。FileType 1.01 以降は分岐設定から導出、旧形式読込専用) | 持たない。S00 リーダーが読込時に分岐推定へ変換、.oud 書き出し時は隣接駅の駅時刻形式から自動生成(format 層) |
| entDgr 一式(描画座標) | derive の `computeDiagramLayout()` の戻り値 |

例外として **駅 ID(`CentDedEki::m_iID`)はストアに残す**。ファイルには出力されないが(CconvCentDed.cpp に ID キーなし)、同名駅の区別という編集セッション内で安定であるべき識別子であり、Undo/Redo(patch)と一緒に巻き戻る必要があるため、導出キャッシュには置けない。読込時・駅挿入時に domain が空き番号を自動採番する(原典と同じ規則)。

### 1.5 未知キーの保持

アーキテクチャ §6.1 の決定(未知キー・未知ノードの透過書き戻し)をデータモデル側で支える機構として、**ファイル由来の各エンティティに `unknownEntries?: UnknownEntry[]` を持たせる**。パス(index)をキーにした側テーブル方式は駅挿入等で index がずれるため採用しない。エンティティに付随させれば、配列要素の移動・コピーに自然に追従する。

対象は将来版がキーを追加しうる**すべてのファイル上ディレクトリノード**であり、`EkiTrack2` / `OuterTerminal` / `CrossingCheckRule`(いずれも分析 §03 §4 のディレクトリノード)も含む。エンティティに写像されない**中間ディレクトリ**(`Eki` 配下の `EkiTrack2Cont.`、`Dia` 配下の `Kudari.` / `Nobori.`)の直下に現れた未知キー・未知ノードは、親エンティティ(`Eki` / `Dia`)の `unknownEntries` に保持する。この場合 `UnknownEntry.container` に中間ディレクトリ名(`'EkiTrack2Cont.'` / `'Kudari.'` / `'Nobori.'`)を記録し、`index` は**その中間ディレクトリ内**での出現位置(既知子ノードを含む 0 起点通し番号)とする。`container` 省略時の `index` はエンティティ自身のノード内での出現位置である(§2.1)。

例外として、ルート直下の `FileType` と `FileTypeAppComment` は `unknownEntries` に**含めない**(§2.2)。

---

## 2. TypeScript 型定義

以下は `@oudia/domain` の公開型の全定義である(コメントに原典 C++ フィールド名を併記)。`tsconfig` は strict + `exactOptionalPropertyTypes` を前提とする。型は readonly 修飾なしで宣言し、ストア公開面では Immer の `Immutable<RosenFileData>` で包む(§7.2)。

### 2.1 基本型

```typescript
/** 時刻: 00:00 からの経過秒。0 <= v < 86400。日付概念なし・24h サイクリック。
 *  原典 CdDedJikoku::m_iTotalSeconds。Null(原典 INT_MIN)は Jikoku 型の null で表す */
export type Seconds = number & { readonly __brand: 'Seconds' };

/** Null をとりうる時刻(原典 CdDedJikoku そのもの) */
export type Jikoku = Seconds | null;

/** 経過時間: 符号付き秒。Null 状態なし(原典 CdDedJikan::m_iTotalSeconds) */
export type Jikan = number & { readonly __brand: 'Jikan' };

/** 色: Win32 COLORREF(0x00BBGGRR)をそのまま保持(原典 CdColorProp)。
 *  ファイルの "%08X" と 1:1 のためラウンドトリップが自明。CSS 変換は render 層の
 *  colorrefToCss() で行う */
export type Colorref = number & { readonly __brand: 'Colorref' };

/** 列車方向(原典 ERessyahoukou)。Dia.ressyaCont のタプル添字と一致させるため数値 */
export type Ressyahoukou = 0 | 1;
export const RESSYAHOUKOU_KUDARI = 0 as const; // Ressyahoukou_Kudari
export const RESSYAHOUKOU_NOBORI = 1 as const; // Ressyahoukou_Nobori

/** フォント(原典 CdConnectedString2 形式のフォント指定。分析 §03 §6.5) */
export interface FontProp {
  pointTextHeight: number;             // PointTextHeight
  logicalunitTextHeight: number | null; // LogicalunitTextHeight(通常未使用)
  logicalunitCellHeight: number | null; // LogicalunitCellHeight(通常未使用)
  facename: string;                    // Facename
  bold: boolean;                       // Bold("1" のときのみ出力)
  italic: boolean;                     // Itaric(ファイルキーは原文ママの綴り)
  underline: boolean;                  // Underline
  strikeOut: boolean;                  // StrikeOut
  escapement: number;                  // Escapement(回転。GDI lfEscapement 相当。既定 0)
}

/** 未知キー・未知ノードの透過保持(§1.5、アーキテクチャ §6.1) */
export interface UnknownEntry {
  /** 元ノード内での出現位置(既知キーを含む 0 起点の通し番号)。
   *  ライターは既知キーをテーブル順に出力しつつ、この index 位置に再挿入する */
  index: number;
  /** エンティティに写像されない中間ディレクトリ('EkiTrack2Cont.' / 'Kudari.' / 'Nobori.')
   *  直下の未知エントリを親エンティティ(Eki / Dia)で保持する場合のみ設定(§1.5)。
   *  設定時、index はその中間ディレクトリ内での出現位置 */
  container?: string;
  name: string;
  value?: string;        // プロパティ行(エスケープ解除済み)。ディレクトリなら省略
  children?: RawEntry[]; // ディレクトリ(未解釈サブツリー)。プロパティなら省略
}

/** 未解釈ノード(WindowPlacement と未知ディレクトリの中身) */
export interface RawEntry {
  name: string;
  value?: string;
  children?: RawEntry[];
}
```

### 2.2 ルート

```typescript
/** ファイル 1 個ぶんの全体(原典 CDedRosenFileData 相当) */
export interface RosenFileData {
  /** 読込元の FileType 文字列(例 "OuDiaSecond.1.17"、"OuDia.1.02")。
   *  表示・診断用。書き出しは常に "OuDiaSecond.1.17" 固定で、この値は使わない */
  sourceFileType: string;
  rosen: Rosen;                        // Rosen. ノード
  dispProp: DispProp;                  // DispProp. ノード
  /** WindowPlacement. ノード(1.12〜、任意)。Web 版では解釈せず透過保持し、
   *  書き出し時に同内容を書き戻す(アーキテクチャ §4.5) */
  windowPlacement: RawEntry[] | null;
  /** ルート直下の未知キー・未知ノード(FileType / FileTypeAppComment は含めない — 下記) */
  unknownEntries?: UnknownEntry[];
}
```

`FileType` と `FileTypeAppComment` はルートの `unknownEntries` に**含めず、読込時に消費する**。`FileType` は `sourceFileType` として保持し、`FileTypeAppComment` は破棄する(原典でも読込では未解釈で、エラー表示にのみ使う — 分析 §03 §1)。書き出し時はライターが `FileType`(先頭行)と `FileTypeAppComment`(最終行。原典は「`<アプリ名> Ver. <版>`」を必ず自前で付加する)を再生成する。読み込んだ旧値を `unknownEntries` 経由で書き戻すと自前付加分と同名キーが二重出力され、原典の再保存結果と食い違うため、この消費規則を必須とする。

### 2.3 Rosen(路線)

```typescript
/** 路線(原典 CentDedRosen) */
export interface Rosen {
  rosenmei: string;                    // m_strName / キー Rosenmei
  kudariDiaAlias: string;              // m_strKudariDiaAlias(空 = 「下り」)
  noboriDiaAlias: string;              // m_strNoboriDiaAlias(空 = 「上り」)
  ekiCont: Eki[];                      // m_CentDedEkiCont。添字 = 駅Index(下り始発 = 0)
  ressyasyubetsuCont: Ressyasyubetsu[]; // m_CentDedRessyasyubetsuCont。1 要素以上
  diaCont: Dia[];                      // m_CentDedDiaCont。name が路線内一意
  /** ダイヤグラム起点時刻(m_jikokuKitenJikoku)。クラスコメント上は「Null 不可」だが、
   *  ファイル読込経路では空の KitenJikoku= が Null のまま setKitenJikoku され
   *  (CconvCentDed.cpp:4947-4966。setter は無修正代入 — CentDedRosen.h:545)、
   *  書き出し(同 4774-4778)は encode 素通しで空文字列がそのまま往復する。
   *  ラウンドトリップのバイト一致を守るため null を許容し、compareJikoku 等の
   *  演算では null を 0(00:00:00)相当として扱う(§4.2) */
  kitenJikoku: Jikoku;
  diagramDgrYZahyouKyoriDefault: number; // m_iDiagramDgrYZahyouKyoriDefault(既定 60、秒)
  enableOperation: 0 | 1 | 2;          // m_iEnableOperation(0=無効/1=簡易/2=通常)
  operationNumberReverse: boolean;     // m_bOperationNumberReverse
  /** m_bOperationCrossKitenJikoku。注意: 原典コンストラクタ既定は true だが、
   *  読込は ==="1" 判定のためキー省略時は false になる(CconvCentDed.cpp:5019)。
   *  新規作成時は true、読込時はファイルの値(省略 = false)に従う */
  operationCrossKitenJikoku: boolean;
  kijunDiaIndex: number;               // m_iKijunDiaIndex(diaCont への index。既定 0)
  disableHiddenSyubetsu: boolean;      // m_bDisableHiddenSyubetsu
  comment: string;                     // m_strComment(複数行可。ファイルでは \n エスケープ)
  unknownEntries?: UnknownEntry[];
}
```

### 2.4 Eki(駅)・EkiTrack2(番線)・付随構造

```typescript
/** 駅(原典 CentDedEki) */
export interface Eki {
  /** 駅 ID(m_iID)。同名駅の区別用。ファイル非出力。読込・挿入時に domain が
   *  空き番号を自動採番する(§1.4) */
  id: number;
  ekimei: string;                      // m_strEkimei
  ekimeiJikokuRyaku: string;           // m_strEkimeiJikokuhyouRyaku / キー EkimeiJikokuRyaku(空 = 駅名を使用)
  ekimeiDiaRyaku: string;              // m_strEkimeiDiagramRyaku / キー EkimeiDiaRyaku
  ekijikokukeisiki: Ekijikokukeisiki;  // m_eEkijikokukeisiki
  ekikibo: Ekikibo;                    // m_eEkikibo
  diagramRessyajouhouHyoujiKudari: DiagramRessyajouhouHyouji; // m_eDiagramRessyajouhouHyoujiKudari
  diagramRessyajouhouHyoujiNobori: DiagramRessyajouhouHyouji;
  downMain: number;                    // m_iDownMain(下り主本線。ekiTrack2Cont への index)
  upMain: number;                      // m_iUpMain(上り主本線)
  ekiTrack2Cont: EkiTrack2[];          // m_CentDedEkiTrack2Cont(既定 2 番線)
  brunchCoreEkiIndex: number | null;   // m_iBrunchCoreEkiIndex(-1 → null。基幹駅の駅Index)
  brunchOpposite: boolean;             // m_bBrunchOpposite
  loopOriginEkiIndex: number | null;   // m_iLoopOriginEkiIndex(-1 → null。起点駅の駅Index)
  loopOpposite: boolean;               // m_bLoopOpposite
  outerTerminalCont: OuterTerminal[];  // m_OuterTerminalCont(路線外発着駅)
  nextEkiDistance: number;             // m_iNextEkiDistance(秒。0 = 路線既定を使用)
  crossingCheckRuleCont: CrossingCheckRule[]; // m_CrossingCheckRuleCont

  // ---- 時刻表・ダイヤグラム表示設定 ----
  jikokuhyouTrackDisplayKudari: boolean; // m_bJikokuhyouTrackDisplayKudari(発番線表示)
  jikokuhyouTrackDisplayNobori: boolean;
  diagramTrackDisplay: boolean;        // m_bDiagramTrackDisplay(在線表表示)
  diagramTrackOmit: boolean[];         // m_bDiagramTrackOmit(番線数と同数。在線表での省略)
  jikokuhyouTrackOmit: boolean;        // m_bJikokuhyouTrackOmit(番線編集モードの欄省略)
  jikokuhyouOperationOrigin: 0 | 1 | 2 | 3;   // m_iJikokuhyouOperationOrigin(始発側作業欄数)
  jikokuhyouOperationTerminal: 0 | 1 | 2 | 3; // m_iJikokuhyouOperationTerminal(終着側)
  jikokuhyouOperationOriginDownBeforeUpAfter: boolean;   // 作業欄の前後配置 4 種
  jikokuhyouOperationOriginDownAfterUpBefore: boolean;
  jikokuhyouOperationTerminalDownBeforeUpAfter: boolean;
  jikokuhyouOperationTerminalDownAfterUpBefore: boolean;
  jikokuhyouJikokuDisplayKudari: JikokuDisplay; // キー JikokuhyouJikokuDisplayKudari("着,発")
  jikokuhyouJikokuDisplayNobori: JikokuDisplay;
  jikokuhyouSyubetsuChangeDisplayKudari: SyubetsuChangeDisplay; // 次列車情報欄(5 値)
  jikokuhyouSyubetsuChangeDisplayNobori: SyubetsuChangeDisplay;
  jikokuhyouPrevSyubetsuChangeDisplayKudari: SyubetsuChangeDisplay; // 前列車情報欄(1.17〜)
  jikokuhyouPrevSyubetsuChangeDisplayNobori: SyubetsuChangeDisplay;
  jikokuhyouNyuusenJikokuDisplayKudari: boolean; // 入線時刻欄(1.17〜)
  jikokuhyouNyuusenJikokuDisplayNobori: boolean;
  diagramColorNextEki: number;         // m_iDiagramColorNextEki(0–4。DiaBackColor の index)
  operationTableDisplayJikoku: boolean; // m_bOperationTableDisplayJikoku
  jikokuhyouOuterDisplayKudari: OuterDisplay; // キー JikokuhyouOuterDisplayKudari("始発,終着")
  jikokuhyouOuterDisplayNobori: OuterDisplay;
  unknownEntries?: UnknownEntry[];
}

/** 着/発時刻表示("着,発" の 2 値。既定 両方 true) */
export interface JikokuDisplay {
  chaku: boolean;
  hatsu: boolean;
}

/** 種別変更/次列車・前列車情報欄の表示設定("a,b,c,d,e" の 5 値。既定 0,0,0,0,1) */
export interface SyubetsuChangeDisplay {
  ressyabangou: 0 | 1 | 2 | 3;         // a: 列車番号
  operationNumber: 0 | 1 | 2 | 3 | 4;  // b: 運用番号
  syubetsu: 0 | 1 | 2 | 3;             // c: 列車種別
  ressyamei: 0 | 1 | 2 | 3;            // d: 列車名
  operationNumberRows: 1 | 2 | 3 | 4 | 5; // e: 運用番号段数
}

/** 路線外始発/終着欄表示("始発,終着" の 2 値。既定 0,0) */
export interface OuterDisplay {
  origin: boolean;
  terminal: boolean;
}

/** 番線(原典 CentDedEkiTrack2) */
export interface EkiTrack2 {
  trackName: string;                   // m_strTrackName(空文字列 = isNull)
  trackRyakusyou: string;              // m_strTrackRyakusyou(略称。共通または下り用)
  trackNoboriRyakusyou: string;        // m_strTrackNoboriRyakusyou(空 = 共通略称を使用)
  unknownEntries?: UnknownEntry[];     // EkiTrack2. ノード直下の未知キー(§1.5)
}

/** 路線外発着駅(原典 CentDedEki.h の OuterTerminal 構造体) */
export interface OuterTerminal {
  ekimei: string;                      // OuterTerminalEkimei
  jikokuRyaku: string;                 // OuterTerminalJikokuRyaku(空 = 頭文字)
  diaRyaku: string;                    // OuterTerminalDiaRyaku
  unknownEntries?: UnknownEntry[];     // OuterTerminal. ノード直下の未知キー(§1.5)
}

/** 交差チェックの番線指定(原典 TrackContent) */
export interface TrackContent {
  trackType: TrackType;                // eTrackType
  index: number;                       // iTrackIndex(意味は trackType 依存 — §5)
}

/** 平面交差支障チェックルール(原典 CrossingCheckRule。1.11〜) */
export interface CrossingCheckRule {
  caption: string;                     // strCaption(必須・空不可)
  enable: boolean;                     // bEnable(ファイル省略時 true)
  headwaySecond: number;               // iHeadwaySecond(時隔上限秒。既定 60。これ未満で支障)
  headwaySecondMinimum: number;        // iHeadwaySecondMinimum(下限秒。1.13〜。既定 0)
  beforeFromTrackContentCont: TrackContent[]; // BeforeFromTrackContentCont(";" 連結)
  beforeToTrackContentCont: TrackContent[];
  afterFromTrackContentCont: TrackContent[];
  afterToTrackContentCont: TrackContent[];
  beforeIsArrival: boolean;            // bBeforeIsArrival(着基準か)
  beforeIsTsuuka: boolean;             // bBeforeIsTsuuka(通過対象か)
  afterIsArrival: boolean;
  afterIsTsuuka: boolean;
  unknownEntries?: UnknownEntry[];     // CrossingCheckRule. ノード直下の未知キー(§1.5)
}
```

### 2.5 Ressyasyubetsu(列車種別)

```typescript
/** 列車線スタイル(原典 CdDiagramLineStyle) */
export interface DiagramLineStyle {
  senColor: Colorref;                  // m_colorDiagramSenColor / キー DiagramSenColor
  senStyle: SenStyle;                  // m_eDiagramSenStyle / キー DiagramSenStyle
  isBold: boolean;                     // m_bDiagramSenIsBold / キー DiagramSenIsBold
}

/** 列車種別(原典 CentDedRessyasyubetsu) */
export interface Ressyasyubetsu {
  syubetsumei: string;                 // m_strSyubetsumei(コンテナ所属中は空不可)
  ryakusyou: string;                   // m_strRyakusyou
  jikokuhyouMojiColor: Colorref;       // m_colorJikokuhyouMojiColor(既定 黒)
  jikokuhyouFontIndex: number;         // m_iJikokuhyouFontIndex(0–7。DispProp.jikokuhyouFont の index)
  jikokuhyouBackColor: Colorref;       // m_colorJikokuhyouBackColor(既定 白)
  diagramLineStyle: DiagramLineStyle;  // m_CdDiagramLineStyle
  stopMarkDrawType: StopMarkDrawType;  // m_eStopMarkDrawType
  parentSyubetsuIndex: number | null;  // m_iParentSyubetsuIndex(-1 → null。ressyasyubetsuCont への index)
  hidden: boolean;                     // m_bHidden(隠し種別。1.15〜)
  unknownEntries?: UnknownEntry[];
}
```

### 2.6 Dia(ダイヤ)・Ressya(列車)・EkiJikoku(駅時刻)

```typescript
/** ダイヤ(原典 CentDedDia)。導出コンテナ(OperationTableContent 等)と
 *  ランタイムフラグ(m_bWaitOperationUpdate / m_iPatternDiagramPreviewRange)は
 *  持たない(§1.4) */
export interface Dia {
  name: string;                        // m_strName(路線内一意・空不可)
  mainBackColorIndex: number;          // m_iJikokuhyouMainBackColorIndex(DispProp.jikokuhyouBackColor の index)
  subBackColorIndex: number;           // m_iJikokuhyouSubBackColorIndex
  backPatternIndex: number;            // m_iJikokuhyouBackPatternIndex
  patternDiagramPreviewEnable: boolean; // m_bPatternDiagramPreviewEnable(1.16〜)
  patternDiagramPreviewCycleSecond: number; // m_iPatternDiagramPreviewCycleSecond(60–10800。既定 600)
  /** m_CentDedRessyaCont[2]。[0] = 下り、[1] = 上り(Ressyahoukou と一致) */
  ressyaCont: [Ressya[], Ressya[]];
  unknownEntries?: UnknownEntry[];
}

/** 列車(原典 CentDedRessya) */
export interface Ressya {
  /** m_bIsNull: 時刻表ビューの空行。true でも ekiJikokuCont は駅数分持つ。
   *  方向以外のフィールド変更で false へ落とすのはコマンドレデューサの責務 */
  isNull: boolean;
  houkou: Ressyahoukou;                // m_eRessyahoukou(所属コンテナと常に一致 — 不変条件 §8)
  syubetsuIndex: number;               // m_iRessyasyubetsuIndex(ressyasyubetsuCont への index。既定 0)
  ressyabangou: string;                // m_strRessyabangou
  ressyamei: string;                   // m_strRessyamei
  gousuu: string;                      // m_strGousuu
  bikou: string;                       // m_strBikou
  isCanceled: boolean;                 // m_bIsCanceled(運休。1.15〜)
  /** m_CentDedEkiJikokuCont: 常に路線の駅数と同数。添字 = 駅Order(方向基準) */
  ekiJikokuCont: EkiJikoku[];
  unknownEntries?: UnknownEntry[];
}

/** 駅時刻(原典 CentDedEkiJikoku)。最もインスタンス数が多い型
 *  (列車数 × 駅数。500 列車 × 50 駅で 25,000 個) */
export interface EkiJikoku {
  ekiatsukai: Ekiatsukai;              // m_eEkiatsukai
  chakuJikoku: Jikoku;                 // m_jikokuChakujikoku
  hatsuJikoku: Jikoku;                 // m_jikokuHatsujikoku
  /** m_iRessyaTrackIndex: その駅の ekiTrack2Cont への index。
   *  null = 未設定(原典 INT_MIN)。ekiatsukai を 'none' にすると 0 にリセット(§8) */
  ressyaTrackIndex: number | null;
  beforeOperationCont: BeforeOperation[]; // m_CentDedBeforeOperationCont(時系列順)
  afterOperationCont: AfterOperation[];   // m_CentDedAfterOperationCont(時系列順)
}
```

### 2.7 前作業・後作業(判別可能ユニオン)

原典の汎用スロット設計(`m_bBoolData1/2, m_iIntData1/2/3, m_JikokuData1/2/3, m_strOperationNumber1/2/3, m_strInOutLinkCode` の意味が作業種類で変わる)を判別可能ユニオンに正規化する。**フィールドはファイル形式(分析 §03 §6.4)に書かれるパラメータのみ**とし、運用探索が書き込む導出スロット(※印: 前列車接続時刻・前列車方向・前列車終着駅 Order・種別変更接続フラグ・割当運番有効フラグ・増結後運番等)は含めない(§2.10 の `OperationCache` へ)。

`kind` の値は前後作業で共通にし、ジェネリックな処理(時系列表示・削除カスケード)を書きやすくする。

```typescript
/** 前作業(原典 CentDedBeforeOperation、EBOperation で種別分け) */
export type BeforeOperation =
  | BOperationShunt
  | BOperationConnect
  | BOperationRelease
  | BOperationOut
  | BOperationOuter
  | BOperationJunction
  | BOperationNumberChange;

/** 入換(EBOperation::BOperation_Shunt = 0)
 *  ファイル書式: 0/入換元番線idx$入換発時刻/[入換着時刻]$着時刻表示(0|1) */
export interface BOperationShunt {
  kind: 'shunt';
  shuntTrackIndex: number;   // m_iIntData1: 入換元番線(当駅 ekiTrack2Cont への index)
  shuntHatsuJikoku: Jikoku;  // m_JikokuData1: 入換発時刻
  shuntChakuJikoku: Jikoku;  // m_JikokuData2: 入換着時刻(null = 発と同時)
  displayJikoku: boolean;    // m_bBoolData1: 入換着時刻を当駅着時刻とみなして表示
}

/** 増結(BOperation_Connect = 1)。相手編成の前作業列を入れ子で保持
 *  ファイル書式: 1/前方に連結(0|1)$連結時刻 + 子キー "{親パス}.{作業idx}B" */
export interface BOperationConnect {
  kind: 'connect';
  connectToFront: boolean;   // m_bBoolData1: 増結編成を親編成の前方に連結するか
  connectJikoku: Jikoku;     // m_JikokuData1: 増結時刻(null = 着時刻等から補完)
  formationBeforeOperationCont: BeforeOperation[]; // m_CentDedBeforeOperationCont(入れ子・再帰)
}

/** 解結(BOperation_Release = 2)。解結編成の後作業列を入れ子で保持
 *  ファイル書式: 2/解結位置$解結両数/解結時刻 + 子キー "{親パス}.{作業idx}A" */
export interface BOperationRelease {
  kind: 'release';
  releasePosition: 0 | 1 | 2; // m_iIntData1: 0=後方 / 1=前方 / 2=前方以外
  releaseCount: number;       // m_iIntData2: 解結編成数
  releaseJikoku: Jikoku;      // m_JikokuData1: 解結時刻
  formationAfterOperationCont: AfterOperation[]; // m_CentDedAfterOperationCont(入れ子・再帰)
}

/** 出区(BOperation_Out = 3)。有効始発駅の前作業先頭のみ
 *  ファイル書式: 3/出区時刻$入出区連携コード/元運用番号(;連結) */
export interface BOperationOut {
  kind: 'out';
  outJikoku: Jikoku;          // m_JikokuData1: 出区時刻(ダイヤグラム丸印位置)
  inOutLinkCode: string;      // m_strInOutLinkCode(1.10〜。空 = 連携なし)
  operationNumbers: string[]; // m_strOperationNumber1: 連結編成 1 本につき運番 1 個
}

/** 路線外始発(BOperation_Outer = 4)
 *  ファイル書式: 4/路線外始発駅idx$始発時刻/当駅着時刻$入出区連携コード/元運用番号(;連結) */
export interface BOperationOuter {
  kind: 'outer';
  outerTerminalIndex: number; // m_iIntData1: 当駅 outerTerminalCont への index
  outerHatsuJikoku: Jikoku;   // m_JikokuData1: 路線外駅の発車時刻
  chakuJikoku: Jikoku;        // m_JikokuData2: 当駅の着時刻(Ver2 で駅時刻から作業側へ移動)
  inOutLinkCode: string;      // m_strInOutLinkCode
  operationNumbers: string[]; // m_strOperationNumber1
}

/** 前列車接続(BOperation_Junction = 5)。出区・路線外以外の先頭作業はすべてこれ。
 *  接続相手はデータとして持たず、運用探索が時刻・番線・駅から解決する(導出値は
 *  OperationCache へ)。ファイル書式: 5/起点時刻$仮運用番号(;連結) */
export interface BOperationJunction {
  kind: 'junction';
  kitenJikoku: Jikoku;            // m_JikokuData1: 探索起点時刻
  kariOperationNumbers: string[]; // 仮運用番号(運用番号スロット)
}

/** 運用番号変更(BOperation_NumberChange = 6)
 *  ファイル書式: 6/運用番号(;連結)。空配列 = 運用番号順反転(1.13〜。
 *  原典 m_bBoolData1 相当の情報を「空」で表現するのはファイル形式と同じ規則) */
export interface BOperationNumberChange {
  kind: 'numberChange';
  operationNumbers: string[];
}

/** 後作業(原典 CentDedAfterOperation、EAOperation)。前作業とほぼ対称 */
export type AfterOperation =
  | AOperationShunt
  | AOperationConnect
  | AOperationRelease
  | AOperationIn
  | AOperationOuter
  | AOperationJunction
  | AOperationNumberChange;

/** 入換(AOperation_Shunt = 0)
 *  ファイル書式: 0/入換先番線idx$入換発時刻/[入換着時刻]$発時刻表示(0|1) */
export interface AOperationShunt {
  kind: 'shunt';
  shuntTrackIndex: number;   // m_iIntData1: 入換先番線
  shuntHatsuJikoku: Jikoku;  // m_JikokuData1
  shuntChakuJikoku: Jikoku;  // m_JikokuData2
  displayJikoku: boolean;    // m_bBoolData1: 入換発時刻を当駅発時刻とみなして表示
}

/** 増結(AOperation_Connect = 1)。子は相手編成の前作業列(前作業の増結と同じ) */
export interface AOperationConnect {
  kind: 'connect';
  connectToFront: boolean;
  connectJikoku: Jikoku;
  formationBeforeOperationCont: BeforeOperation[];
}

/** 解結(AOperation_Release = 2) */
export interface AOperationRelease {
  kind: 'release';
  releasePosition: 0 | 1 | 2;
  releaseCount: number;
  releaseJikoku: Jikoku;
  formationAfterOperationCont: AfterOperation[];
}

/** 入区(AOperation_In = 3)。ファイル書式: 3/入区時刻$入出区連携コード */
export interface AOperationIn {
  kind: 'in';
  inJikoku: Jikoku;          // m_JikokuData1: 入区時刻
  inOutLinkCode: string;     // m_strInOutLinkCode
}

/** 路線外終着(AOperation_Outer = 4)
 *  ファイル書式: 4/路線外終着駅idx$当駅発時刻/終着時刻$入出区連携コード */
export interface AOperationOuter {
  kind: 'outer';
  outerTerminalIndex: number; // m_iIntData1
  hatsuJikoku: Jikoku;        // 当駅の発時刻
  outerChakuJikoku: Jikoku;   // 路線外駅への終着時刻
  inOutLinkCode: string;
}

/** 次列車接続(AOperation_Junction = 5)
 *  ファイル書式: 5/終点時刻$次列車接続タイプ(0–3) */
export interface AOperationJunction {
  kind: 'junction';
  syuutenJikoku: Jikoku;               // m_JikokuData1: 探索終点時刻
  junctionType: AfterJunctionType;     // m_iIntData1: 次列車接続タイプ(§5)
}

/** 運用番号変更(AOperation_NumberChange = 6)。空配列 = 順反転 */
export interface AOperationNumberChange {
  kind: 'numberChange';
  operationNumbers: string[];
}
```

### 2.8 補助ハンドル(参照キー)

エンティティには含まれないが、コマンドパラメータ・derive の入出力・UI 選択状態で使う軽量キー。

```typescript
/** 時刻 Order(原典 CdDedJikokuOrder)。列車内の特定の着/発時刻を指す。
 *  数値換算: jikokuOrder = ekiOrder * 2 + (item === 'hatsu' ? 1 : 0) */
export interface JikokuOrder {
  ekiOrder: number;              // m_iEkiOrder(方向基準。原典の負値 Null は使わず、Null はこの型自体を null に)
  item: 'chaku' | 'hatsu';       // EEkiJikokuItem { EkiJikokuItem_Chaku = 0, EkiJikokuItem_Hatsu = 1 }
}

/** 列車参照キー(原典 CdDedRessyaProperty)。運用探索・導出キャッシュのキー */
export interface RessyaProperty {
  houkou: Ressyahoukou;          // m_eRessyahoukou
  ressyaIndex: number | null;    // m_iRessyaIndex(-1 → null)
  jikoku: Jikoku;                // m_aCdDedJikoku(出区時刻等。区別用)
}
```

### 2.9 DispProp(表示設定)

```typescript
/** 表示プロパティ(原典 CdDedDispProp / DispProp. ノード)。全キー常時出力(分析 §03 §5.8) */
export interface DispProp {
  jikokuhyouFont: FontProp[];          // JikokuhyouFont × 8(idx1=Bold, idx2=Itaric, idx3=Bold+Itaric が既定)
  jikokuhyouVFont: FontProp;           // JikokuhyouVFont(縦書き。既定 9pt @メイリオ)
  diaEkimeiFont: FontProp;             // DiaEkimeiFont
  diaJikokuFont: FontProp;             // DiaJikokuFont
  diaRessyaFont: FontProp;             // DiaRessyaFont
  operationTableFont: FontProp;        // OperationTableFont(1.09〜)
  allOperationTableJikokuFont: FontProp; // AllOperationTableJikokuFont(1.09〜)
  commentFont: FontProp;               // CommentFont
  diaMojiColor: Colorref;              // DiaMojiColor(既定 黒)
  diaBackColor: Colorref[];            // DiaBackColor × 5(1.09〜。既定 白 × 5)
  diaRessyaColor: Colorref;            // DiaRessyaColor(原典に廃止予定注記)
  diaJikuColor: Colorref;              // DiaJikuColor(既定 C0C0C0)
  jikokuhyouBackColor: Colorref[];     // JikokuhyouBackColor × 4(既定 白/F0F0F0/白/白)
  stdOpeTimeLowerColor: Colorref;      // StdOpeTimeLowerColor(基準運転時分比較。既定 FFE0E0)
  stdOpeTimeHigherColor: Colorref;     // StdOpeTimeHigherColor(既定 E0FFFF)
  stdOpeTimeUndefColor: Colorref;      // StdOpeTimeUndefColor(既定 FFFF80)
  stdOpeTimeIllegalColor: Colorref;    // StdOpeTimeIllegalColor(既定 A0A0A0)
  operationStringColor: Colorref;      // OperationStringColor(既定 黒)
  operationGridColor: Colorref;        // OperationGridColor(既定 黒)
  ekimeiLength: number;                // EkimeiLength(駅名欄幅・全角数。既定 6)
  jikokuhyouRessyaWidth: number;       // JikokuhyouRessyaWidth(列車欄幅。既定 5)
  anySecondIncDec1: number;            // AnySecondIncDec1(任意秒送り 1。既定 5)
  anySecondIncDec2: number;            // AnySecondIncDec2(既定 15)
  displayRessyamei: boolean;           // DisplayRessyamei(既定 true。"0" のときのみ false)
  displayOuterTerminalEkimeiOriginSide: boolean;   // DisplayOuterTerminalEkimeiOriginSide
  displayOuterTerminalEkimeiTerminalSide: boolean; // DisplayOuterTerminalEkimeiTerminalSide
  diagramDisplayOuterTerminal: number; // DiagramDisplayOuterTerminal(既定 0)
  secondRoundChaku: SecondRound;       // SecondRoundChaku(1.08〜)
  secondRoundHatsu: SecondRound;       // SecondRoundHatsu
  display2400: boolean;                // Display2400(0:00 着を 24:00 表記。1.08〜)
  operationNumberRows: number;         // OperationNumberRows(運用番号段数。1.10〜。既定 1)
  displayInOutLinkCode: boolean;       // DisplayInOutLinkCode(1.10〜)
  unknownEntries?: UnknownEntry[];
}

/** 秒処理(CdDedJikoku::CConv::ESecondRound)。0=切捨 / 1=丸め / 2=切上 */
export type SecondRound = 0 | 1 | 2;
```

### 2.10 ストア外の導出型(`@oudia/derive`、参考)

以下は `RosenFileData` には**含まれない**。derive パッケージの純関数の出力であり、apps/web が導出キャッシュとして保持する。詳細設計は derive の設計ドキュメントに委ねるが、ストアとの境界を確定するためここに形を示す。

```typescript
/** 運用探索(CDedOperationConnecter 移植)の出力。ダイヤ 1 個単位。
 *  原典で前後作業の※印スロットと Dia の 3 導出コンテナに書き込まれていた内容 */
export interface OperationDeriveResult {
  /** 作業ごとの導出値。キーは「方向/列車Index/駅Order/B|A/作業パス」の文字列キー */
  operationSlots: Map<string, DerivedOperationSlot>;
  /** m_contOperationTableContent 相当: 運用番号 → 運用表内容リスト */
  operationTableContent: Map<string, OperationTableContent[]>;
  /** m_contCustomizeRessyaIndexKudari/Nobori 相当 */
  customizeJikokuhyouContent: [CustomizeJikokuhyouContent[], CustomizeJikokuhyouContent[]];
  /** m_contInOutLinkCodeContent 相当 */
  inOutLinkCodeContent: Map<string, InOutLinkCodeContent>;
}

/** 作業の導出スロット(原典※印: 割当運番・前列車接続時刻(在線表有/無)・
 *  前列車方向・前列車終着駅 Order・種別変更接続・割当運番有効 等) */
export interface DerivedOperationSlot { /* v0.7 で確定 */ }

/** 分岐・環状の派生マップ(原典 m_iBrunchLoopPosition / m_iEkiIndexBrunchOriginSide /
 *  m_iEkiIndexLoop / m_iEkiIndexBrunchTerminalSide)。
 *  domain の純関数 deriveBrunchLoopMap(ekiCont) が返し、ekiCont の参照同一性で memoize */
export interface BrunchLoopMap {
  /** 駅ごと: 'originSideBrunch'(原典 INT_MIN) | 'standalone'(-1) | ループ内 Index(0 以上) |
   *  'terminalSideBrunch'(INT_MAX) */
  positions: (number | 'originSideBrunch' | 'standalone' | 'terminalSideBrunch')[];
  ekiIndexBrunchOriginSide: number[][];
  ekiIndexLoop: number[][];
  ekiIndexBrunchTerminalSide: number[][];
}

/** ダイヤグラムレイアウト(entDgr 相当)は computeDiagramLayout() の出力。
 *  X = 秒(起点相対、86400 超・負を許容)、Y = 秒単位駅間幅。詳細は描画設計へ */
export interface DiagramLayout { /* アーキテクチャ §5.1 */ }
```

---

## 3. C++ クラス ⇄ TS 型の対応表

| C++(entDed) | TS 型 | 備考 |
|---|---|---|
| `CDedRosenFileData` | `RosenFileData` | ルート。WindowPlacement は `RawEntry[]` で透過保持 |
| `CentDedRosen` | `Rosen` | |
| `CentDedEkiCont` / `CXCentDedEkiCont` | `Eki[]` | 整合カスケードは domain 関数へ(§8) |
| `CentDedEki` | `Eki` | 派生マップ(BrunchLoop)と `m_bKyoukaisen` は除外 |
| `CentDedEkiTrack2Cont` | `EkiTrack2[]` | |
| `CentDedEkiTrack2` | `EkiTrack2` | |
| `OuterTerminal`(構造体) | `OuterTerminal` | |
| `TrackContent` / `ETrackType` | `TrackContent` / `TrackType` | |
| `CrossingCheckRule`(構造体) | `CrossingCheckRule` | |
| `CentDedRessyasyubetsuCont` | `Ressyasyubetsu[]` | 種別 Index シフトは domain 関数へ |
| `CentDedRessyasyubetsu` | `Ressyasyubetsu` | |
| `CdDiagramLineStyle` | `DiagramLineStyle` | |
| `CentDedDiaCont` | `Dia[]` | 名前一意はコマンド事前検証で強制 |
| `CentDedDia` | `Dia` | 導出コンテナ 3 種・ランタイムフラグ 2 種は除外(§1.4) |
| `CXRessyaCont m_CentDedRessyaCont[2]` | `[Ressya[], Ressya[]]` | タプル添字 = `Ressyahoukou` |
| `CentDedRessya` | `Ressya` | |
| `CentDedEkiJikokuCont` | `EkiJikoku[]` | 駅数一致の不変条件は §8 |
| `CentDedEkiJikoku` | `EkiJikoku` | |
| `CentDedBeforeOperation` | `BeforeOperation`(union 7 種) | スロット → 名前付きフィールド |
| `CentDedAfterOperation` | `AfterOperation`(union 7 種) | 同上 |
| `CdDedJikoku` | `Jikoku`(`Seconds \| null`) | INT_MIN → null |
| `CdDedJikan` | `Jikan` | |
| `CdDedJikokuOrder` | `JikokuOrder` | |
| `CdDedRessyaProperty` | `RessyaProperty` | |
| `CdColorProp` | `Colorref` | COLORREF 数値のまま |
| `CdDedDispProp` | `DispProp` | |
| (フォント: CdConnectedString2) | `FontProp` | |
| `CDedRessyaSoater` 派生 8 種 | domain の比較関数群 `ressyaComparators.*` | 「index ソート → 実体並べ替え」は不要(配列の `toSorted`) |
| `CRessyaContUnifier` | domain 関数 `unifyRessyaCont()` | |
| `CentDedRessya_EkijikokuModifyOperation2` | `EditCommand` の `ekiJikoku/modify` 系コマンド | |
| `CDedOperationConnecter` | derive 関数(Worker 実行)→ `OperationDeriveResult` | v0.7 |
| entDgr 群(`CentDedDgrDia` ほか) | derive `computeDiagramLayout()` → `DiagramLayout` | ストア外 |

---

## 4. 時刻・時間の表現

### 4.1 内部表現の決定

- **時刻 = `Seconds`(ブランド付き number)**。00:00 からの経過秒、`0 <= v < 86400`(原典 `TOTALSECONDS_A_DAY`)。分単位ではなく秒単位(原典と同一)。ブランド型により「秒数」「index」「Jikan」の取り違えをコンパイル時に防ぐ。
- **未設定時刻 = `null`**(`Jikoku = Seconds | null`)。原典の `INT_MIN` 番兵は全廃する。`exactOptionalPropertyTypes` 下で「フィールド省略」ではなく明示的 `null` を使う(Immer パッチの安定性と JSON 序列化のため)。
- **経過時間 = `Jikan`(符号付き秒、null なし)**。時刻と型レベルで区別する。

### 4.2 24 時超え・日跨ぎ

原典仕様をそのまま移植する(domain の `jikoku.ts` に純関数として実装)。

- **日付概念はなく 24 時間サイクリック**。25:00 の設定は 1:00 として保持する(`normalizeSeconds()`: mod 86400。負値にも適用され、**-1 秒は 23:59:59 になる**——原典 `adjustTotalSeconds()` の挙動)。
- **日跨ぎ比較は起点時刻基準**: `compareJikoku(a, b, kitenJikoku)` は路線の `kitenJikoku` を最小とみなす循環比較(例: 起点 5:00 なら 5:00 < 23:59 < 0:00 < 4:59)。`kitenJikoku` が null(ファイルの空 `KitenJikoku=` 由来 — §2.3)のときは 0(00:00:00)とみなす。**比較対象の null は常に最小**。ソート・運用接続・駅時刻表のバケツ分け・交差支障判定のすべてがこの関数を使う。独自の比較を書くことを禁止する(lint ルール化はしないが、コードレビュー基準とする)。
- `subJikoku(a, b)`: 差を**絶対値 12 時間以下の側**の `Jikan` で返す(1:00 − 23:00 = +2h)。いずれかが null なら 0。
- `addSeconds(jikoku, sec)`: 加減算後に mod 正規化。
- **24 時超えの「表現」はダイヤグラム座標側(`DiagramLayout` の DgrX)にのみ存在する**。DgrX は起点相対の秒で負や 86400 超を許容するが、これは derive の導出値でありストアの `Jikoku` には現れない(原典の entDed / entDgr の区別と同一)。

### 4.3 文字列との変換(format 層)

- decode(分析 §03 §6.1): 空 → null。コロンなしは末尾から 2 桁区切り(`'915'` = 9:15、`'131545'` = 13:15:45)。コロン付きも許容。秒省略は `:00` 補完。範囲は 0≤時<24 / 0≤分<60 / 0≤秒<60、範囲外はエラー(-2 系)。
- encode: コロンなし・時の先頭ゼロなし・秒 0 省略(`g_CdDedJikokuConv` の設定 `(NoColon, EHour_ZeroToNone, ESecond_NotIfZero)` を再現)。null → 空文字列。
- 表示用の丸め(`SecondRound`)・「2400」表記(`display2400`)は derive/render の関心事であり、**ファイルには常に生値(秒付き)が入る**。

---

## 5. 列挙値の定義

domain では文字列リテラルユニオン、ファイル上の表現(数値 / 識別子文字列)との対応は format 層のテーブルで定義する。以下が正規の対応表である(左 = TS、右 = ファイル値。原典 enum 値も併記)。

### 5.1 Ekiatsukai(駅扱)— 原典 `EEkiatsukai`

```typescript
export type Ekiatsukai = 'none' | 'teisya' | 'tsuuka';
```

| TS | 原典 | ファイル(EkiJikoku 内) | 意味 |
|---|---|---|---|
| `'none'` | `Ekiatsukai_None` | 空 / `0` | 運行なし(規定値)。着発時刻は null |
| `'teisya'` | `Ekiatsukai_Teisya` | `1` | 停車 |
| `'tsuuka'` | `Ekiatsukai_Tsuuka` | `2` | 通過 |

旧 OuDia の `3`(経由なし、`Ekiatsukai_Keiyunasi`)は enum に**含めない**。読込時に `'none'` へ変換する(S00 リーダー。範囲外値も `'none'`)。経由なしは分岐・環状設定で表現される(原典 Ver2.00 の仕様変更に追随)。

### 5.2 Ekijikokukeisiki(駅時刻形式)— 原典 `EEkijikokukeisiki`

```typescript
export type Ekijikokukeisiki =
  | 'hatsu' | 'hatsuchaku' | 'kudariChaku' | 'noboriChaku'
  | 'kudariHatsuchaku' | 'noboriHatsuchaku';
```

| TS | 原典 / ファイル識別子 | 意味 |
|---|---|---|
| `'hatsu'` | `Jikokukeisiki_Hatsu` | 発のみ(規定値)。終着駅では着のみ |
| `'hatsuchaku'` | `Jikokukeisiki_Hatsuchaku` | 発着両方 |
| `'kudariChaku'` | `Jikokukeisiki_KudariChaku` | 下り着のみ・上り発のみ |
| `'noboriChaku'` | `Jikokukeisiki_NoboriChaku` | 下り発のみ・上り着のみ |
| `'kudariHatsuchaku'` | `Jikokukeisiki_KudariHatsuchaku` | 下り発着・上り発のみ |
| `'noboriHatsuchaku'` | `Jikokukeisiki_NoboriHatsuchaku` | 下り発のみ・上り発着 |

ファイルは識別子文字列そのもの(`Ekijikokukeisiki=Jikokukeisiki_Hatsu`)。不正値は読込エラー(-22 系)。

### 5.3 Ekikibo(駅規模)— 原典 `EEkikibo`

```typescript
export type Ekikibo = 'ippan' | 'syuyou';
```

`'ippan'` = `Ekikibo_Ippan`(規定)/ `'syuyou'` = `Ekikibo_Syuyou`(主要駅。ダイヤグラム横罫線が太線)。ファイルは識別子文字列。

### 5.4 DiagramRessyajouhouHyouji(ダイヤグラム列車情報表示)

```typescript
export type DiagramRessyajouhouHyouji = 'origin' | 'anytime' | 'not';
```

`'origin'`(始発駅なら表示・既定。**ファイルではキー自体を出力しない**)/ `'anytime'` = `DiagramRessyajouhouHyouji_Anytime` / `'not'` = `_Not`。

### 5.5 SenStyle(線スタイル)— 原典 `ESenStyle`

```typescript
export type SenStyle = 'jissen' | 'hasen' | 'tensen' | 'ittensasen';
```

`SenStyle_Jissen`(実線・既定)/ `_Hasen`(破線)/ `_Tensen`(点線)/ `_Ittensasen`(一点鎖線)。ファイルは識別子文字列。

### 5.6 StopMarkDrawType(停車駅明示)— 原典 `EStopMarkDrawType`

```typescript
export type StopMarkDrawType = 'drawOnStop' | 'nothing' | 'drawOnPass';
```

`_DrawOnStop`(短時間停車駅に ○・既定)/ `_Nothing` / `_DrawOnPass`(未使用・将来予約だが読込互換のため定義)。

### 5.7 TrackType(交差チェックの番線種別)— 原典 `ETrackType`

```typescript
export type TrackType = 'track' | 'origin' | 'terminal' | 'outer';
```

| TS | ファイル値 | `TrackContent.index` の意味 |
|---|---|---|
| `'track'` | `0` | 駅の番線 index |
| `'origin'` | `1` | 路線の起点側(index = 駅Index) |
| `'terminal'` | `2` | 路線の終点側(index = 駅Index) |
| `'outer'` | `3` | 路線外発着(index = outerTerminalCont の index) |

### 5.8 AfterJunctionType(次列車接続タイプ)— 原典 後作業 `m_iIntData1`

```typescript
export type AfterJunctionType =
  | 'unrelated' | 'classChange' | 'propertyChange' | 'propertySame';
```

| TS | ファイル値 | 原典(EBeforeAfterType 対応) | 意味 |
|---|---|---|---|
| `'unrelated'` | `0` | `BeforeAfterType_Unrelated` | 別列車 |
| `'classChange'` | `1` | `_ClassChange` | 種別変更 |
| `'propertyChange'` | `2` | `_PropertyChange` | 列車情報変更 |
| `'propertySame'` | `3` | `_PropertySame` | 同一列車扱い |

範囲外は読込時 `'unrelated'` に補正(原典の 0 補正を踏襲)。

### 5.9 数値のまま保持する擬似列挙

意味が「段階・個数」であり名前を与える利益がないものは数値リテラルユニオンで持つ: `Ressyahoukou (0 | 1)`、`enableOperation (0 | 1 | 2)`、`SecondRound (0 | 1 | 2)`、`releasePosition (0 | 1 | 2)`、`SyubetsuChangeDisplay` の各フィールド、`jikokuhyouOperationOrigin/Terminal (0–3)`。いずれもファイル値と同一。

---

## 6. エンティティ間参照の持ち方

### 6.1 決定: 出現順 index 参照(ID 参照は採用しない)

アーキテクチャ §4.1 の決定に従い、**全参照を「出現順 0 起点 index」で持つ**。oud2 ファイルの全参照(種別・番線・駅・ダイヤ・路線外駅)が index であり、内部モデルを同じ座標系に保つことが、(1) format 層を無変換の素通しにでき、(2) index 補正規則(範囲外 → 主本線等)をファイル仕様のまま実装・検証でき、(3) ラウンドトリップ黄金テストの失敗をモデルまで一直線に遡れる、という互換上の利益を持つ。ID 化による参照安定性は、§8 の整合カスケード + プロパティテストで代替する。

### 6.2 参照フィールドの一覧(全数)

| 参照元フィールド | 参照先 | 範囲外時の補正(読込時。format 層) |
|---|---|---|
| `Rosen.kijunDiaIndex` | `diaCont` | キー省略時: DiaName「基準運転時分」を名前検索、なければ 0 |
| `Eki.downMain` / `upMain` | 自駅 `ekiTrack2Cont` | 非数 → 0 |
| `Eki.brunchCoreEkiIndex` | `ekiCont`(駅Index) | -1 → null |
| `Eki.loopOriginEkiIndex` | `ekiCont`(駅Index) | -1 → null |
| `Eki.diagramColorNextEki` | `DispProp.diaBackColor`(0–4) | 非数 → 0 |
| `TrackContent.index` | trackType 依存(§5.7) | 範囲外 → 0 |
| `Ressyasyubetsu.parentSyubetsuIndex` | `ressyasyubetsuCont` | -1 → null。範囲外 → null |
| `Ressyasyubetsu.jikokuhyouFontIndex` | `DispProp.jikokuhyouFont`(0–7) | 範囲外は読込エラー(-101) |
| `Dia.mainBackColorIndex` ほか背景色 3 種 | `DispProp.jikokuhyouBackColor` 等 | 空 → 既定値 |
| `Ressya.syubetsuIndex` | `ressyasyubetsuCont` | 非数 → 0 |
| `EkiJikoku.ressyaTrackIndex` | 該当駅の `ekiTrack2Cont` | **範囲外 → 主本線(下り = downMain / 上り = upMain)** |
| `BOperationShunt.shuntTrackIndex` 等(作業内番線) | 該当駅の `ekiTrack2Cont` | 範囲外 → 0 |
| `BOperationOuter.outerTerminalIndex` / `AOperationOuter.outerTerminalIndex` | 該当駅の `outerTerminalCont` | 範囲外 → 0 |
| `RessyaProperty.ressyaIndex` | `Dia.ressyaCont[houkou]` | -1 → null(ランタイム型のみ、非永続) |

### 6.3 null 番兵の変換規則(format 層の責務)

| モデル | ファイル |
|---|---|
| `brunchCoreEkiIndex: null` | `BrunchCoreEkiIndex` キー省略(-1 は書かない) |
| `loopOriginEkiIndex: null` | 同上 |
| `parentSyubetsuIndex: null` | `ParentSyubetsuIndex` キー省略 |
| `Jikoku` の `null` | 空文字列(時刻部の省略) |
| `ressyaTrackIndex: null` | 駅扱 `'none'` の要素は要素全体が空。それ以外では `$番線` を必ず出力するため、書き出し前に主本線で解決する。**原典との差異**: 原典は `getRessyaTrackIndex()` の生値を stringOf するため、未設定(INT_MIN)のまま停車に昇格した要素は `$-2147483648` を出力する(CconvCentDed.cpp CentDedEkiJikoku_To_string。setChakujikoku の 'none'→'teisya' 昇格は番線を設定しない — CentDedEkiJikoku.cpp)。Web 版は意図的に主本線へ解決する。読込時の範囲外補正(§6.2: 範囲外 → 主本線)と同値になるため実害はないが、同一編集後の保存バイト列が Windows 版と一致しない可能性がある差異として明示する |

### 6.4 二重インデックス(駅Index / 駅Order)の扱い

原典の二重体系をそのまま維持する。

- **駅Index**: 路線基準(下り始発 = 0)。`Rosen.ekiCont` の添字。分岐・環状・基幹駅参照はすべて駅Index。
- **駅Order**: 列車方向基準(始発 = 0)。`Ressya.ekiJikokuCont` の添字。ファイルの `EkiJikoku` 値・`Operation{駅Order}B|A` キーも駅Order。
- 変換は domain の純関数で提供する(原典 `EkiIndexOfEkiOrder` / `EkiOrderOfEkiIndex` の直訳):

```typescript
export function ekiIndexOfEkiOrder(ekiOrder: number, ekiCount: number, houkou: Ressyahoukou): number {
  return houkou === RESSYAHOUKOU_KUDARI ? ekiOrder : ekiCount - 1 - ekiOrder;
}
// ekiOrderOfEkiIndex も同形(対合写像)
```

- **時刻Order** = `駅Order * 2 + (0: 着, 1: 発)`(`JikokuOrder` 型、§2.8)。

---

## 7. 更新戦略

### 7.1 イミュータブル更新 + 単一チョークポイント(確定)

アーキテクチャ §4.3–4.4 の決定に従う。本書では型面の帰結のみ規定する。

- `RosenFileData` は**イミュータブルに更新**する。変更は必ず名前付き `EditCommand` を `executeCommand()` に渡し、内部で Immer `produceWithPatches` を使う。コマンドレデューサは `Draft<RosenFileData>` に対する命令的コードとして書く(C++ の execute() 直訳を許容)。
- 直接代入・配列破壊操作をストア外から行う経路は存在しない(Zustand ストアは `Immutable<RosenFileData>` のみ公開)。

### 7.2 型の readonly 戦略

- エンティティ interface 自体は readonly 修飾**なし**で宣言する(§2)。レデューサ内の draft 操作と format 層の構築コードを素直に書くため。
- 読み取り面の不変性は Immer の `Immutable<T>`(全プロパティ deep-readonly)で担保する:

```typescript
import type { Immutable, Draft } from 'immer';

export type ReadonlyRosenFileData = Immutable<RosenFileData>;

// ストア公開面
interface DocumentStore {
  rosenFileData: ReadonlyRosenFileData;
  executeCommand(cmd: EditCommand): void;
  undo(): void;
  redo(): void;
}

// コマンドレデューサの型
export type CommandReducer<C extends EditCommand> =
  (draft: Draft<RosenFileData>, cmd: C) => void;
```

### 7.3 Undo/Redo との整合

- patch 方式(履歴エントリ `{command, patches, inversePatches}`)の前提として、**モデルは JSON 互換のプレーンデータでなければならない**。本書の型はこれを満たす: `Map` / `Set` / クラスインスタンス / 関数を含まず、`undefined` を値に使わない(null を使う)。ブランド型は実行時にはただの number。
- `Dia.ressyaCont` のタプル・作業ユニオンの入れ子もプレーンな配列 / オブジェクトであり、Immer のパッチパス(`["rosen","diaCont",0,"ressyaCont",0,5,"ekiJikokuCont",12,"beforeOperationCont",0,"formationBeforeOperationCont",0,...]`)で一意に到達できる。
- **駅 ID(`Eki.id`)をストア内に置く根拠も Undo 整合である**(§1.4): 駅削除 → Undo で復元されたとき、ID がパッチで一緒に戻ることで、同名駅参照(ビュー記述子等)が壊れない。
- 導出キャッシュ(`OperationDeriveResult` / `DiagramLayout` / `BrunchLoopMap`)は履歴に**含めない**。Undo/Redo 後はコマンド型ヒントに従い再計算する(memoize キーが構造共有の参照同一性なので、巻き戻った部分木ではキャッシュが自然にヒット / ミスする)。

### 7.4 ホットパスの逃げ道

数百列車の一括シフト等で Immer のコピーコストが問題化した場合に備え、コマンドレデューサは「draft を受け取る関数」単位で分離し、実測後に特定コマンドのみ `produceWithPatches` を使わない手書き構造共有 + 手書きパッチ生成に差し替え可能とする(アーキテクチャ §9.5)。型 `CommandReducer` のシグネチャはこの差し替えを跨いで不変。

---

## 8. 整合性ルール(不変条件と整合カスケード)

原典の「制約」「操作のエラー検査・修正」(分析 §02 §12)を、(a) **不変条件**(常に成立すべき述語)、(b) **整合カスケード**(構造編集コマンドのレデューサが必ず呼ぶ修正関数)、(c) **事前検証**(違反コマンドの拒否)に分類して実装する。すべて `@oudia/domain` に置く。

### 8.1 不変条件(プロパティテストで常設検証)

| # | 不変条件 | 原典根拠 |
|---|---|---|
| I1 | 全ダイヤ・全方向・全列車について `ressya.ekiJikokuCont.length === rosen.ekiCont.length` | CentDedEkiJikokuCont(列車側 insert/erase 禁止) |
| I2 | `dia.name` は `diaCont` 内で一意かつ空でない | CXCentDedDiaCont(限定子) |
| I3 | `syubetsumei` は空でない。`ressyasyubetsuCont.length >= 1` | CentDedRessyasyubetsu |
| I4 | `ressya.houkou === h` ⟺ その列車が `ressyaCont[h]` に属する | 列車方向の固定 |
| I5 | `kitenJikoku` は null を許容(ファイルの空 `KitenJikoku=` をそのまま往復保持 — §2.3)。演算では null を 0(00:00:00)相当として扱う | CconvCentDed.cpp:4947-4966(空 → Null のまま setKitenJikoku)・4774-4778(encode 素通し出力) |
| I6 | 参照 index の全域有効性: `syubetsuIndex` ∈ [0, 種別数)、`ressyaTrackIndex` は null または [0, 当駅番線数)、`downMain`/`upMain` ∈ [0, 番線数)、`brunchCoreEkiIndex`/`loopOriginEkiIndex` は null または [0, 駅数)、`kijunDiaIndex` ∈ [0, ダイヤ数)、`diagramTrackOmit.length === ekiTrack2Cont.length` ほか §6.2 の全行 | 各 adjust |
| I7 | `ekiatsukai === 'none'` ⇒ `chakuJikoku === null && hatsuJikoku === null && beforeOperationCont.length === 0 && afterOperationCont.length === 0` | setEkiatsukai の副作用 |
| I8 | `ekiatsukai === 'teisya'` は着発とも null を許容する(「時刻なし停車」。ファイル上 `1$番線` として合法に永続化される)。set 系ヘルパは teisya を 'none' へ降格**しない**(降格はユーザーの明示操作のみ) | CentDedEkiJikoku::setEkiatsukai / set(降格処理なし)、CconvCentDed.cpp CentDedEkiJikoku_To_string / From_string |

これらは Vitest のプロパティベーステスト(任意の駅追加削除・種別入替・番線再マップの系列を生成して I1–I8 を検証)を CI 常設とする(アーキテクチャ §7.2 / §9.7)。

### 8.2 EkiJikoku の自動修正規則(原典 CentDedEkiJikoku 直訳)

domain の `setEkiatsukai(draftEkiJikoku, value)` 等のヘルパに閉じ込め、レデューサはヘルパ経由でのみ駅時刻を書く。

1. `'none'` 設定 → 着発時刻を null 化、`ressyaTrackIndex = 0`、前後作業を全削除。
2. `'none'` の駅に非 null の着または発時刻を設定 → 自動で `'teisya'` に昇格。
3. 駅時刻形式変更時の `adjustByEkijikokukeisiki(chaku可, hatsu可, 始発か, 終着か)`: 形式に無い側の時刻をもう一方へコピーして null 化(着↔発の詰め替え)。
4. 補完付き取得(`getChakujikoku(hatsuIfNull)` 相当)は derive/render 用の純関数 `resolveChakuJikoku(ekiJikoku)` として提供(ストア値は書き換えない)。

逆方向の降格(`'teisya'` かつ着発とも null → `'none'`)は**行わない**。原典の `setEkiatsukai`(CentDedEkiJikoku.cpp:180-192)と `set` の 2 オーバーロード(同 318-360)のいずれにも降格処理はなく、「時刻なし停車」はファイル上 `1$番線` として合法に永続化・復元される(I8。format リーダーはこのヘルパを通らず 4 引数 `set` 相当で値をそのまま復元する)。

### 8.3 整合カスケード(構造編集レデューサの必須手順)

原典の CX...Cont オーバーライド + CRfEditCmd_Eki の実行順序を、draft に対する関数列として固定する。**実行順序も原典に忠実**とする(アーキテクチャ §4.3)。

#### (a) 駅の挿入・削除・置換(`eki/replaceRange` コマンド)

```
1. ekiCont の erase / set / insert
2. 全ダイヤ・全方向・全列車の ekiJikokuCont を同位置で増減(伝播)
   - 挿入時(CentDedEkiJikokuCont::onEkiInsert 直訳): 挿入位置の前後(駅Order-1 / 駅Order)の
     EkiJikoku がともに ekiatsukai !== 'none' の列車(= 走行中区間への挿入)では
     { ekiatsukai:'tsuuka', 時刻 null, ressyaTrackIndex: 主本線, 作業なし }、
     それ以外(端への挿入を含む)は既定値 { ekiatsukai:'none', 時刻 null,
     ressyaTrackIndex: null, 作業なし }
     (上り列車は駅Order 座標に変換した位置へ挿入)
3. deriveBrunchLoopMap 系の再整合: brunchCoreEkiIndex / loopOriginEkiIndex の
   旧→新 駅Index 対応表による付け替え(削除された駅を指す設定は無効化 = null)
4. 駅時刻形式の変更があれば全列車に adjustByEkijikokukeisiki
5. 番線・路線外駅の 旧→新 index 対応表(-1 = 削除)で全ダイヤ・全列車の
   ressyaTrackIndex / 作業内番線 / outerTerminalIndex を再マップ
   (削除された番線を指すものは主本線へ)
6. crossingCheckRuleCont の TrackContent を同対応表で調整(参照先喪失ルールは無効化)
7. 全列車の adjustOperation(作業整合 — 下記 (d))
8. (運用再探索はレデューサ外 — コマンド完了後に Worker へ非同期依頼)
```

#### (b) 種別の挿入・削除・入替(`syubetsu/replaceRange` / `syubetsu/swap`)

- 全ダイヤ・全列車の `syubetsuIndex` を旧→新対応表でシフト。**削除された種別を指す列車は 0(既定種別)へ**。
- `parentSyubetsuIndex` も同対応表で付け替え(削除された親を指すものは null)。
- 種別 0 個になる削除は事前検証で拒否(I3)。

#### (c) ダイヤの挿入・削除・改名

- 改名・挿入時の名前重複は事前検証で拒否(I2)。
- `kijunDiaIndex` を旧→新対応表で付け替え(削除時は 0 へ)。
- タブ(ビュー記述子)の自動クローズはストア購読側の責務であり domain には持ち込まない。

#### (d) 作業整合 `adjustOperation`(原典 CentDedRessya::adjustOperation 直訳)

駅時刻・駅扱の変更後に列車単位で呼ぶ:

- 有効始発駅(`getValidSihatsuEkiOrder`)の前作業先頭は先端作業(`out` / `outer` / `junction`)でなければならない。
- 有効終着駅の後作業末尾は終端作業(`in` / `outer` / `junction`)でなければならない。
- 有効範囲外の駅に残った作業は削除。
- 入れ子作業(`formationBeforeOperationCont` / `formationAfterOperationCont`)にも再帰適用。

#### (e) 分岐・環状マップの再計算

原典は駅編集の度に各駅の派生マップ(`m_iEkiIndexLoop` 等)を `adjustBrunchLoopBy...` で更新するが、Web 版ではストアに持たないため「再計算」は不要で、**カスケード (a)-3 で参照(`brunchCoreEkiIndex` / `loopOriginEkiIndex`)の整合だけを保てばよい**。`deriveBrunchLoopMap(ekiCont)` は参照が整合していれば常に計算可能。原典の `adjustBrunchLoopByBrunchEdit / ByLoopEdit` に相当する編集時の正規化(相互矛盾する分岐・環状設定の解消)は、分岐・環状を設定するコマンド(`eki/setBrunch` / `eki/setLoop`)のレデューサ内で移植する。

### 8.4 その他の原典規則(コマンド実装時のチェックリスト)

- **列車の Null 状態**: 方向以外の setter 相当の変更で `isNull = false` に落とす。全駅時刻が `'none'` でも明示的に Null 化しない限り `isNull` は変わらない(原典挙動)。
- **列車方向の固定**: `ressya/replaceRange` は挿入先コンテナと `houkou` の一致を事前検証。方向を変える操作は存在しない(直通化・一本化も方向内で完結)。
- **一本化(`unifyRessyaCont`)の条件**: 列車番号が非空で一致 + `syubetsuIndex` 一致 + 有効発着駅の連続性。マージ時、方向的に重複する始発前作業 / 終着後作業はコピーしない(分析 §02 §13.2)。
- **駅 ID 自動採番**: 駅挿入時に既存 ID 集合の空き最小値を割当(読込時は出現順に 0, 1, 2, …)。
- **ソート(`ressyaComparators`)**: 駅扱優先順「停車・通過 → 運行なし」、時刻は非 null 優先 + `compareJikoku(a, b, kitenJikoku)`。8 種の比較キー(駅扱・列車番号・列車名・種別・備考・運用番号・番線・乗継)を原典どおり移植する。乗継ソートのみ `DiagramLayout` の推定時刻に依存するため derive 側に置く。

---

## 付録 A: フィールド既定値一覧(新規作成時)

domain の `createDefault*()` ファクトリ関数が返す値。ファイル省略時の読込デフォルト(format 層のテーブル)とは別物である点に注意(例: `operationCrossKitenJikoku` は新規作成 true / ファイル省略時 false)。

| ファクトリ | 主な既定値 |
|---|---|
| `createDefaultRosen()` | kitenJikoku = 0(00:00)、diagramDgrYZahyouKyoriDefault = 60、enableOperation = 0、operationCrossKitenJikoku = **true**、kijunDiaIndex = 0、種別 1 個(「普通」相当)を含む |
| `createDefaultEki()` | ekijikokukeisiki = 'hatsu'、ekikibo = 'ippan'、番線 2 個(downMain = 0 / upMain = 1)、nextEkiDistance = 0、表示設定は全 false / 0 系、jikokuhyouJikokuDisplay = {chaku: true, hatsu: true}、SyubetsuChangeDisplay = {0,0,0,0,1} |
| `createDefaultEkiTrack2()` | trackName = ''(Null 番線) |
| `createDefaultRessyasyubetsu()` | 文字色 黒、フォント 0、背景 白、線 = 実線・黒・細、stopMarkDrawType = 'drawOnStop'、parentSyubetsuIndex = null |
| `createDefaultDia()` | patternDiagramPreviewCycleSecond = 600、ressyaCont = [[], []] |
| `createDefaultRessya(houkou, ekiCount)` | isNull = true、syubetsuIndex = 0、ekiJikokuCont = 駅数分の既定 EkiJikoku |
| `createDefaultEkiJikoku()` | ekiatsukai = 'none'、時刻 null、ressyaTrackIndex = null、作業なし |
| `createDefaultDispProp()` | 分析 §03 §5.8 の既定値表のとおり(9pt Meiryo UI ほか) |

---

## 付録 B: 本書で決定した事項の要約

1. 内部モデルはファイル同型の index 参照 POJO ツリー。親逆参照なし・正規化なし。
2. 命名はローマ字維持 + ハンガリアン除去。ファイルキー名優先。`〜Cont` 維持。
3. Null 番兵(INT_MIN / -1)は全て `null`。0-as-default は 0 のまま。
4. 時刻は `Seconds` ブランド秒 + null。循環比較 `compareJikoku(a, b, kiten)` を唯一の比較とする。
5. 色は COLORREF 数値のまま(`Colorref` ブランド)。
6. 列挙は文字列リテラルユニオン(ファイル値対応表は format 層)。方向のみ数値 0 | 1。
7. 駅作業は前後 × 7 種の判別可能ユニオン。導出スロットは型ごと排除しストア外へ。
8. ストアは「ファイルに書かれる手入力値 + 駅 ID」のみ。導出値・ランタイムフラグは derive / UI ストアへ。
9. 未知キーはエンティティ付随の `unknownEntries` で保持(パスキー側テーブルは不採用)。
10. 更新は Immer draft レデューサ + patch 履歴。モデルは JSON 互換プレーンデータであることを規約とする。
11. 整合性は不変条件 I1–I8 + 整合カスケード関数 + 事前検証の 3 層で守り、プロパティテストを CI 常設する。
