# ドメインモデル(エンティティ)分析 — entDed / entDgr

対象: OuDiaSecond ver 2.06.23
ソース: `origin/DiagramEdit/DiagramEdit/entDed/`(編集用ドメインエンティティ)、`origin/DiagramEdit/DiagramEdit/entDgr/`(ダイヤグラム描画用エンティティ)

本書は Web 再実装のためのドメインモデル調査結果である。クラス名・フィールド名・列挙値はすべて原文のまま記載し、根拠ソースパス(origin/ からの相対)を添える。「事実」はソースで確認した内容、「推測」は明示する。

---

## 1. 概要 — オブジェクトツリー全体像

ルートは `CentDedRosen`(路線)。所有関係(包含)は以下の通り(CentDedRosen.h のクラスコメントで明記)。

```
CentDedRosen (路線)  … エンティティツリーのルート
├─ m_CentDedEkiCont : CXCentDedEkiCont (CentDedEkiCont 派生)
│    └─ CentDedEki (駅) × N            … 添え字 = 駅Index
│         └─ m_CentDedEkiTrack2Cont : CXEkiTrack2Cont
│              └─ CentDedEkiTrack2 (番線) × M
├─ m_CentDedRessyasyubetsuCont : CXCentDedRessyasyubetsuCont
│    └─ CentDedRessyasyubetsu (列車種別) × K (1以上)
└─ m_CentDedDiaCont : CXCentDedDiaCont
     └─ CentDedDia (ダイヤ) × D          … m_strName が一意 (限定子)
          └─ m_CentDedRessyaCont[2] : CXRessyaCont*   [0]=下り [1]=上り
               └─ CentDedRessya (列車) × R
                    └─ m_CentDedEkiJikokuCont : CXEkiJikokuCont
                         └─ CentDedEkiJikoku (駅時刻) × N (駅数と常に一致、添え字 = 駅Order)
                              ├─ m_CentDedBeforeOperationCont → CentDedBeforeOperation (前作業) × 任意
                              │    ├─ m_CentDedBeforeOperationCont (増結編成の前作業; 再帰)
                              │    └─ m_CentDedAfterOperationCont (解結編成の後作業; 再帰)
                              └─ m_CentDedAfterOperationCont  → CentDedAfterOperation (後作業) × 任意
                                   ├─ m_CentDedBeforeOperationCont (再帰)
                                   └─ m_CentDedAfterOperationCont (再帰)
```

- 出典: `DiagramEdit/DiagramEdit/entDed/CentDedRosen.h`, `CentDedDia.h`, `CentDedRessya.h`, `CentDedEkiJikoku.h`, `CentDedBeforeOperation.h`, `CentDedAfterOperation.h`, `CentDedEki.h`。

### コンテナ基盤(親子コンテナパターン)

全コンテナは OuLib の `CMuiCopiedParent<ElementType>` テンプレート(`libs/OuLib/NsMu/CMuiCopiedParent.h`)を継承する。特徴:

- **値コピー格納**。`insert()/set()/get()` は要素のコピーを扱う(参照ではない)。`get()` のコピーコストが高いため、性能対策として各所でキャッシュや index ソートが行われている(後述の Soater / Unifier)。
- 要素は `CChildBase` 派生で、追加時に `setParent()` が呼ばれ親コンテナへの逆参照を持つ。子は `getParent()` をダウンキャストして親(さらに `getRosen()` / `getDia()` / `getEki()` / `getRessya()` 等の仮想メソッド)にアクセスする。
- `setable()` で挿入・代入の事前検査を行い、制約違反の `operator=` は各クラスの `LException` をスローする。
- `setParent()` 時に各エンティティは `adjust()`(制約に合うよう自属性を修正)を実行し、コンテナは子に adjust を委譲する。

**Web 再実装への示唆(推測を含む)**: この「値コピー+親逆参照+adjust 連鎖」は C++ 特有の設計。TS では immutable データ+正規化ストア(index 参照)+更新関数での不変条件維持に置き換えるのが自然。

---

## 2. 共通の基本型・インデックス体系

### ERessyahoukou(列車方向)
`entDed/CentDed.h`:
```
enum ERessyahoukou { Ressyahoukou_Kudari = 0, Ressyahoukou_Nobori }
```

### 駅Index / 駅Order / 時刻Order(`CentDedRessya.h` クラスコメントに定義)
- **駅Index**: 路線基準。下り始発駅(上り終着駅)= 0、下り終着駅 = 駅数-1。`CentDedRosen`・`CentDedEkiCont` の添え字。
- **駅Order**: 列車方向基準。下り上りとも始発駅 = 0、終着駅 = 駅数-1。`CentDedRessya` 内の `CentDedEkiJikokuCont` の添え字。
- 変換: `EkiIndexOfEkiOrder()` / `EkiOrderOfEkiIndex()`。実装は上り時に `size()-1-i` を返すだけ(`CentDedRessya.cpp` 265-281 行)。
- **時刻Order**: 列車内の特定時刻(着 or 発)を指す順序数。範囲 0 〜 駅数*2-1。`駅Order*2+0`=着時刻、`駅Order*2+1`=発時刻。単純データクラス `CdDedJikokuOrder`(`entDed/CdDedJikokuOrder.h`)が「駅Order(`m_iEkiOrder`) + 着/発(`EEkiJikokuItem { EkiJikokuItem_Chaku=0, EkiJikokuItem_Hatsu=1 }`)」の組で表現。`m_iEkiOrder < 0` が Null。

### CdDedRessyaProperty(列車参照キー)
`entDed/CdDedRessyaProperty.h`。ある列車を「方向 + Index (+ 時刻)」で指す軽量ハンドル:
- `ERessyahoukou m_eRessyahoukou` / `int m_iRessyaIndex`(-1 で Null)/ `CdDedJikoku m_aCdDedJikoku`(出区等時刻)。運用探索系の連想配列キーとして多用される。

---

## 3. 時刻の内部表現

### CdDedJikoku(時刻) — `entDed/CdDedJikoku.h`
- **秒単位**の時刻を表す単純データクラス。内部は `int m_iTotalSeconds`(00:00 からの経過秒)。
- 有効範囲は `0 <= v < 24*60*60`(定数 `TOTALSECONDS_A_DAY = 24*60*60`)。**日付の概念はなく、24時間でサイクリック**。25:00 を設定すると 1:00 として保持(`adjustTotalSeconds()` で正規化。-1 は 23:59:59 になる)。
- **Null 状態**を持つ: `m_iTotalSeconds == INT_MIN`。デフォルトコンストラクタは Null。
- 比較 `compare(value)` は単純比較だが、**起点時刻付き比較** `compare(value, jikokuKitenJikoku)` があり、起点時刻を最小とみなす(例: 起点 5:00 なら 5:00 < 23:59 < 0:00 < 4:59)。日跨ぎダイヤはこの起点時刻相対比較で処理される。Null は常に最小。
- `subJikoku(value)`: 2 時刻の差を秒で返すが、**絶対値が12時間以下の側**を返す(1:00 - 23:00 = +2h)。いずれか Null なら 0。
- `addSeconds()`(`+=`/`-=`)、文字列 decode("13:15:45"/"1315" 等 8 形式)、`CConv` による encode(コロン有無 `m_bNoColon`、時の先頭ゼロ処理 `EHour`、秒の出力 `ESecond {Output, NoSecond, NotIfZero}`、秒丸め `ESecondRound {RoundDown, Round, RoundUp}` を着・発で個別指定、0:00 着の「2400」表記 `m_bDisplay2400`)。

### CdDedJikan(時間) — `entDed/CdDedJikan.h`
- 秒単位の**経過時間**(符号付き `int m_iTotalSeconds`、デフォルト 0)。Null 状態はない。所要時間計算・表示用。

**結論**: 時刻は全域「秒」。分単位ではない。24時超え表記は保持せず(サイクリック)、ソートや接続判定は「ダイヤ起点時刻 `CentDedRosen::m_jikokuKitenJikoku`」を最小値とみなす比較で実現する。

---

## 4. CentDedRosen(路線) — `entDed/CentDedRosen.h/.cpp`

### 属性
| フィールド | 型 | 意味 / 既定値 |
|---|---|---|
| `m_strName` | tstring | 路線名(例「近鉄大阪線」) |
| `m_jikokuKitenJikoku` | CdDedJikoku | ダイヤ起点時刻 = ダイヤグラム左端の時刻。既定 00:00:00。**Null 不可** |
| `m_iDiagramDgrYZahyouKyoriDefault` | int | ダイヤグラム既定駅間幅。単位は『ダイヤグラムエンティティY座標』=**秒**。既定 60 |
| `m_strComment` | tstring | 路線コメント |
| `m_iEnableOperation` | int | 運用機能: 0=無効(既定) / 1=簡易モード(接続のみ・運用番号なし) / 2=通常モード |
| `m_strKudariDiaAlias` / `m_strNoboriDiaAlias` | tstring | 下り/上りの別名(「北行」「南行」等) |
| `m_bOperationNumberReverse` | bool | 折り返し時(下り⇔上り接続時)に運用番号列を反転するか |
| `m_bOperationCrossKitenJikoku` | bool | 運用接続時に起点時刻を跨ぐことを許すか。既定 true |
| `m_iKijunDiaIndex` | int | 基準運転時分を取得するダイヤの Index。既定 0 |
| `m_bDisableHiddenSyubetsu` | bool | 隠し種別を無効にする。既定 false |

### 包含と整合処理(内部クラス CX...Cont のオーバーライドで実装)
- `CXCentDedEkiCont`: 駅の追加・削除時、**包含する全列車へ `CentDedEkiJikoku` の追加・削除を伝播**する(`onEkiInsert/onEkiErase` → `m_CentDedDiaCont.onEkiInsert(...)` → 各 Dia → 各 RessyaCont → 各 Ressya。`CentDedRosen.cpp` 2352-2360 行)。挿入時は駅の主本線 Index(`iMainTrack`)を新しい駅時刻の初期番線として渡す。
- `CXCentDedRessyasyubetsuCont`: 種別の挿入・削除時、全列車の『列車種別Index』(`CentDedRessya::m_iRessyasyubetsuIndex`)をシフトする。**削除された種別を指す列車は Index 0(既定種別)に変更**される。
- `CXCentDedDiaCont`: `CentDedDia::m_strName` を限定子として一意性を強制。同名 Dia の `insertCentDedDia()` はエラー。

---

## 5. CentDedEki(駅) — `entDed/CentDedEki.h`(1882 行、属性最多)

`CChildBase` 派生。番線コンテナ `CXEkiTrack2Cont m_CentDedEkiTrack2Cont` を包含(1137 行)。

### 列挙

**EEkijikokukeisiki(駅時刻形式)** — 時刻表にどの時刻欄を出すか:
| 値 | 意味 |
|---|---|
| `Jikokukeisiki_Hatsu = 0` | 発時刻のみ(規定値)。終着駅では着のみ |
| `Jikokukeisiki_Hatsuchaku` | 発着両方表示 |
| `Jikokukeisiki_KudariChaku` | 下りは着のみ、上りは発のみ |
| `Jikokukeisiki_NoboriChaku` | 下りは発のみ、上りは着のみ |
| `Jikokukeisiki_KudariHatsuchaku` | 下りは発着、上りは発のみ |
| `Jikokukeisiki_NoboriHatsuchaku` | 下りは発のみ、上りは発着 |

**EEkikibo(駅規模)**: `Ekikibo_Ippan = 0`(一般駅・規定値) / `Ekikibo_Syuyou`(主要駅 — ダイヤグラム罫線が太線)。

**EDiagramRessyajouhouHyouji**(ダイヤグラム列車情報表示): `_Origin`(始発駅なら表示・既定) / `_Anytime` / `_Not`。

### 主要属性(路線構造に関わるもの)
| フィールド | 型 | 意味 |
|---|---|---|
| `m_strEkimei` | tstring | 駅名 |
| `m_eEkijikokukeisiki` | EEkijikokukeisiki | 駅時刻形式 |
| `m_eEkikibo` | EEkikibo | 駅規模 |
| `m_bKyoukaisen` | bool | 境界線あり。時刻表で駅欄下に太線。**FileType1.01 以降は分岐駅設定から導出されるため旧形式読込用に残存** |
| `m_iDownMain` / `m_iUpMain` | int | 下り/上り主本線(番線Index)。列車番線の初期値。0以上番線数未満 |
| `m_iID` | int | 駅ID。**同名駅の区別用**。Cont への set/insert 時に空き番号が自動付与 |
| `m_iBrunchCoreEkiIndex` | int | **分岐駅設定**: -1=無効 / 0以上=基幹駅の駅Index |
| `m_bBrunchOpposite` | bool | 分岐が通常と反対向きに合流([Y] ではなく [u] 型) |
| `m_iLoopOriginEkiIndex` | int | **環状線設定**: -1=無効 / 0以上=起点駅の駅Index |
| `m_bLoopOpposite` | bool | 環状が反対向き(○ではなく雫型) |
| `m_iBrunchLoopPosition` + `m_iEkiIndexBrunchOriginSide` / `m_iEkiIndexLoop` / `m_iEkiIndexBrunchTerminalSide` (deque\<int\>) | | 分岐・環状設定から導出した駅接続マップ(**派生キャッシュ**、駅編集の度に再計算)。`m_iBrunchLoopPosition` は INT_MIN=起点方派生駅 / -1=単独駅 / 0以上=Loop 内 Index / INT_MAX=終点方派生駅 |
| `m_OuterTerminalCont` | vector\<OuterTerminal\> | この駅から繋がる**路線外始発終着駅**のリスト |
| `m_iNextEkiDistance` | int | 次駅までの距離(**秒**)。0 なら路線既定の駅間幅を使用 |
| `m_CrossingCheckRuleCont` | vector\<CrossingCheckRule\> | 平面交差チェックルール |

このほか時刻表・ダイヤグラム表示制御のフィールドが多数ある(すべて表示層設定): `m_bJikokuhyouTrackDisplayKudari/Nobori`(番線表示)、`m_bDiagramTrackDisplay`(在線表表示)、`m_bDiagramTrackOmit`(vector\<bool\>、在線表での番線省略)、`m_bJikokuhyouTrackOmit`、`m_iJikokuhyouOperationOrigin/Terminal`(0-3、作業表示欄数)と関連 bool 4 種、`m_strEkimeiJikokuhyouRyaku` / `m_strEkimeiDiagramRyaku`(略称)、着/発時刻表示 bool 4 種、列車番号・運用番号・種別・列車名の表示設定 int 各下り/上り、`前列車(Prev)` 系表示設定一式、路線外始発/終着表示 bool 4 種、`m_iDiagramColorNextEki`(次駅までのダイヤグラム背景色 Index)、`m_bOperationTableDisplayJikoku`、入線時刻表示 bool 2 種。定数 `DIAGRAMBACKCOLOR_COUNT = 5`。

### 付随構造体(CentDedEki.h 内・namespace レベル)

**OuterTerminal**(路線外発着駅): `OuterTerminalEkimei`(駅名) / `OuterTerminalJikokuRyaku`(時刻表用略称、空なら駅名をそのまま使用) / `OuterTerminalDiaRyaku`(ダイヤグラム用略称、空なら駅名の頭文字)。

**ETrackType / TrackContent**(交差チェックの番線指定):
```
enum class ETrackType { TrackType_Track = 0(駅の番線; Index=EkiTrackIndex),
  TrackType_Origin(路線の起点側; Index=駅Index),
  TrackType_Terminal(路線の終点側; Index=駅Index),
  TrackType_Outer(路線外発着; Index=OuterEkiIndex) }
struct TrackContent { ETrackType eTrackType; int iTrackIndex; }
```

**CrossingCheckRule**(平面交差支障チェック 1 ルール): `bEnable`、前動作(`BeforeFromTrackContentCont`/`BeforeToTrackContentCont`/`bBeforeIsArrival`/`bBeforeIsTsuuka`)、後動作(After 同様 4 つ)、`iHeadwaySecond`(時隔上限秒、既定 60。これ未満で支障)、`iHeadwaySecondMinimum`(時隔下限秒、Ver2.06.05〜)、`strCaption`。

---

## 6. CentDedEkiTrack2(番線) / CentDedEkiTrack2Cont

`entDed/CentDedEkiTrack2.h`。属性は 3 つのみ:
- `m_strTrackName`(番線名。**空文字列なら isNull()**)
- `m_strTrackRyakusyou`(略称。共通または下り用)
- `m_strTrackNoboriRyakusyou`(上り用略称。空なら共通略称を上下両方に使用)

`CentDedEkiTrack2Cont`(`entDed/CentDedEkiTrack2Cont.h`)は `CMuiCopiedParent<CentDedEkiTrack2>` 派生。`compareEkiTrack2()` でコンテナ同士の比較が可能。

**列車との関連付け**: 列車の着発番線は `CentDedEkiJikoku::m_iRessyaTrackIndex`(int、その駅の番線コンテナ内 Index)で保持する。初期値は INT_MIN(未設定)で、駅扱を `Ekiatsukai_None` にすると 0 にリセットされる(`CentDedEkiJikoku.cpp` setEkiatsukai)。駅の追加時には主本線(`m_iDownMain`/`m_iUpMain`)が初期番線になる。入換で番線が変わる場合は前後作業(`BOperation_Shunt` 等)が「入換前の番線」(`m_iIntData1`)を持つ。

---

## 7. CentDedRessyasyubetsu(列車種別) — `entDed/CentDedRessyasyubetsu.h`

### 属性
| フィールド | 型 | 意味 / 既定値 |
|---|---|---|
| `m_strSyubetsumei` | tstring | 種別名。**空文字列は無効**(親コンテナ所属中の空文字列化はエラー) |
| `m_strRyakusyou` | tstring | 略称 |
| `m_colorJikokuhyouMojiColor` | CdColorProp | 時刻表文字色(ダイヤグラム列車情報文字色兼用)。既定 黒 |
| `m_iJikokuhyouFontIndex` | int | 時刻表フォント Index。0 ≦ v < `JIKOKUHYOUFONT_COUNT`(=8) |
| `m_colorJikokuhyouBackColor` | CdColorProp | 時刻表背景色(ダイヤの背景色パターンが「種別色」の時に使用)。既定 白 |
| `m_CdDiagramLineStyle` | CdDiagramLineStyle | **列車線スタイル**(下記) |
| `m_eStopMarkDrawType` | EStopMarkDrawType | 停車駅明示方法 |
| `m_iParentSyubetsuIndex` | int | 親種別 Index。-1=OFF(既定)。0以上種別数未満で有効 |
| `m_bHidden` | bool | 隠し種別。true でカスタマイズ時刻表・駅時刻表に非表示 |

### CdDiagramLineStyle(線スタイル、内部クラス)
- `m_colorDiagramSenColor : CdColorProp`(線色、既定 黒)
- `m_eDiagramSenStyle : ESenStyle { SenStyle_Jissen=0(実線), SenStyle_Hasen(破線), SenStyle_Tensen(点線), SenStyle_Ittensasen(一点鎖線) }`
- `m_bDiagramSenIsBold : bool`(太線か、既定 false)

### EStopMarkDrawType
`EStopMarkDrawType_DrawOnStop = 0`(短時間停車駅に○・既定) / `_Nothing`(明示しない=各停等) / `_DrawOnPass`(通過駅明示・**未使用、将来予約**)。

---

## 8. CentDedDia(ダイヤ) — `entDed/CentDedDia.h`

### 属性
| フィールド | 型 | 意味 |
|---|---|---|
| `m_strName` | tstring | ダイヤ名(例「平日ダイヤ」)。**路線内で一意** |
| `m_iJikokuhyouMainBackColorIndex` / `m_iJikokuhyouSubBackColorIndex` / `m_iJikokuhyouBackPatternIndex` | int | 時刻表背景色・パターン設定 |
| `m_bWaitOperationUpdate` | bool | 運用更新保留フラグ |
| `m_bPatternDiagramPreviewEnable` / `m_iPatternDiagramPreviewCycleSecond`(60〜10800) / `m_iPatternDiagramPreviewRange` | | パターンダイヤプレビュー設定 |
| `m_contCustomizeRessyaIndexKudari` / `...Nobori` | vector\<CustomizeJikokuhyouContent\> | カスタマイズ時刻表の列構成(**運用探索の導出結果**) |
| `m_contOperationTableContent` | unordered_map\<tstring, list\<OperationTableContent\>\> | 運用番号→運用表内容(**運用探索の導出結果**) |
| `m_contInOutLinkCodeContent` | map\<tstring, InOutLinkCodeContent\> | 入出区連携コード→連携状態(**運用探索の導出結果**) |

### 包含
`CXRessyaCont* m_CentDedRessyaCont[2]`(879 行)。**[0]=下り、[1]=上り** の 2 本の列車コンテナをポインタ配列で保持。`EkiCount` / `RessyasyubetsuCount` は RessyaCont 側の `m_iEkiCount` 等から決まる派生属性。

### EBeforeAfterType(接続種別、namespace レベル enum class)
```
BeforeAfterType_Unrelated = 0 (別列車) / _ClassChange (種別変更) /
_PropertyChange (列車情報変更) / _PropertySame (同一列車扱い) /
_OutIn (出入区) / _Outer (路線外始発・終着) / _OperationNumberChange (運用番号変更)
```

### 導出データ構造体(いずれも運用探索 CDedOperationConnecter が構築し、Dia に保存)
- **OperationTableContent**: 1 列車内の 1 運用番号の「開始作業〜終了作業」の組。`aRessyaProperty` / `iSihatsuEkiOrder` / `eBeforeType` / 路線外始発 Index・時刻 / `iSyuuchakuEkiOrder` / `eAfterType` / 路線外終着 Index・時刻 / 検索用 `AfterOperation` ポインタ。
- **CustomizeJikokuhyouContent**: カスタマイズ時刻表の 1 列。`iRessyaIndexCont`(この列に表示する列車 Index 列 — 複数列車を 1 列に連結表示可能)、スイッチバック等を路線外発着状に表示するための `iSihatsuEkiOrder`/`iSyuuchakuEkiOrder`(INT_MIN=通常、-1/-2=環状運転)、路線外 Index・時刻各種、`iReleaseEkiOrder`/`iConnectEkiOrder`(増解結矢印位置)、列車が空の場合の代替表示情報(種別・列車番号・列車名・号数・運用番号・駅扱・番線)、`iShiftSecond`(パターンダイヤプレビューの時刻シフト秒)、Prev 系の前列車表示情報。
- **InOutLinkCodeContent**: `contInRessyaProperty` / `contOutRessyaProperty` / `iStatus` / `BeforeOperation*` / `strOperationNumber`。入区で確定した運用番号を同一コードの出区へ引き継ぐための照合バッファ。

---

## 9. CentDedRessya(列車) — `entDed/CentDedRessya.h/.cpp`

### 属性
| フィールド | 型 | 意味 / 既定値 |
|---|---|---|
| `m_bIsNull` | bool | **Null 状態**(時刻表ビューの空行)。既定 true。方向以外の set...() で自動的に false。導出値ではなく**独立フラグ**で、true に戻るのはコンストラクタ・`setIsNull(true)`・`clear()`・代入のみ(`CentDedRessya.cpp`)。全駅時刻が `Ekiatsukai_None` でも自動では Null に戻らない(Web 再実装で「空行」を派生値にすると挙動が変わる点に注意) |
| `m_eRessyahoukou` | ERessyahoukou | 列車方向。コンストラクタで決まり、コンテナ所属中は代入でも変更されない |
| `m_iRessyasyubetsuIndex` | int | 列車種別 Index(Rosen の種別コンテナ対応)。既定 0 |
| `m_strRessyabangou` | tstring | 列車番号 |
| `m_strRessyamei` | tstring | 列車名 |
| `m_strGousuu` | tstring | 号数 |
| `m_strBikou` | tstring | 備考 |
| `m_bIsCanceled` | bool | 運休扱いか。既定 false |

(旧 `m_bSyubetsuChange` は Ver2.05 で削除、駅作業側の「次列車接続タイプ」に移行。)

### 包含
`CXEkiJikokuCont m_CentDedEkiJikokuCont` — 要素数は**常に路線の駅数と一致**、添え字は駅Order。この同期のため `CentDedEkiJikokuCont` は「列車が路線の一部である場合、insert/erase はエラー」(`entDed/CentDedEkiJikokuCont.h` 101-103 行)。駅の増減は必ず Rosen からの通知(`onEkiInsert/onEkiErase`)経由で行われる。

### 主要メソッド
- `getSihatsuEki()` / `getSyuuchakuEki()`: 時刻や駅扱いから始発・終着駅 Order を得る。
- `getValidSihatsuEki()` / `getValidSyuuchakuEki()`: 「発時刻があり、次駅が停車/通過」といった**有効**始発・終着駅 Order(なければ -1)(`CentDedRessya.cpp` 558-580 行)。運用・結合処理の基準。
- `adjustOperation()`: 駅時刻変更後、各駅時刻の前後作業を `CentDedEkiJikoku::adjustOperation(iType)` に委譲して整合させる(有効始発駅の前作業先頭は先端作業、有効終着駅の後作業末尾は終端作業、範囲外の作業は削除、等)。

---

## 10. CentDedEkiJikoku(駅時刻) — `entDed/CentDedEkiJikoku.h/.cpp`

1 列車の 1 駅の時刻。属性:

| フィールド | 型 | 意味 |
|---|---|---|
| `m_eEkiatsukai` | EEkiatsukai | 駅扱 |
| `m_jikokuChakujikoku` | CdDedJikoku | 着時刻 |
| `m_jikokuHatsujikoku` | CdDedJikoku | 発時刻 |
| `m_iRessyaTrackIndex` | int | **着発番線 Index**(この駅の番線コンテナへの添え字)。初期値 INT_MIN |

包含: `CXBeforeOperationCont m_CentDedBeforeOperationCont`(前作業、時系列順) / `CXAfterOperationCont m_CentDedAfterOperationCont`(後作業、時系列順)。初期状態は要素 0。

### EEkiatsukai(駅扱)
```
enum EEkiatsukai {
  Ekiatsukai_None,     // 運行なし(規定値)。着・発時刻は Null
  Ekiatsukai_Teisya,   // 停車
  Ekiatsukai_Tsuuka,   // 通過
  //Ekiatsukai_Keiyunasi, ← 経由なし。enum 値としてはコメントアウト済み(不使用)
}
```
**事実**: 現行コードの enum は 3 値のみで、`Ekiatsukai_Keiyunasi` はコメントアウトされている(`CentDedEkiJikoku.h`)。クラスコメントやソートクラスの説明には「経由なし」の記述が残るが、コード上の使用箇所はない(entDed 全体 grep で 0 件)。経由の有無は分岐駅・環状線設定(`CentDedEki::m_iBrunchCoreEkiIndex` 等)で表現される。旧 OuDia ファイル形式との互換変換では値 3 の扱いに注意(ファイル I/O 担当の分析を参照のこと — 推測)。

### 不変条件・自動修正(クラスコメント+実装で確認)
- 駅扱が `Ekiatsukai_None` → 着・発時刻 Null、番線 0 リセット、前後作業全削除(`setEkiatsukai` 実装、`CentDedEkiJikoku.cpp` 180-192 行)。
- `Ekiatsukai_None` の駅に着または発の非 Null 時刻を設定すると自動で `Ekiatsukai_Teisya` になる。
- `set()`(一括設定)も `Ekiatsukai_None` 指定時に着・発時刻を Null 化し番線を 0 にする(`CentDedEkiJikoku.cpp` 320-359 行)。なお「`Ekiatsukai_Teisya` かつ着発とも Null なら `Ekiatsukai_None` に降格」という自動修正はエンティティには**存在しない**(set/setEkiatsukai/setChakujikoku/setHatsujikoku/adjustOperation のいずれにもない)。
- `adjustByEkijikokukeisiki(bChaku, bHatsu, bIsSihatsueki, bSyuuchakueki)`: 駅時刻形式変更時に着↔発の詰め替え(形式に無い側の時刻をもう一方へコピーして Null 化)。
- `getChakujikoku(bHatsuIfNull)` / `getHatsujikoku(bChakuIfNull)`: 補完付き取得。`getVirtualChakujikoku()/getVirtualHatsujikoku()`: 入換作業の「入換着/発時刻を当駅時刻とみなす」フラグを考慮した表示用時刻。

---

## 11. 前作業・後作業(運用) — CentDedBeforeOperation / CentDedAfterOperation

`entDed/CentDedBeforeOperation.h`(UTF-8 BOM 付きの数少ないファイル)、`CentDedAfterOperation.h`。駅時刻ごとに持つ入換・増解結・出入区・接続などの「作業」。**1 クラスが列挙で種類分けされ、汎用データスロット(m_bBoolData1/2, m_iIntData1/2/3, m_JikokuData1/2/3, m_strOperationNumber1/2/3, m_strInOutLinkCode)の意味が種類ごとに変わる**共用体的設計。※印の属性は運用探索が書き込む導出値。

### 作業種類
前作業 `EBOperation`(enum class):
| 値 | 意味 |
|---|---|
| `BOperation_Shunt` | 入換(規定値)。番線間の移動 |
| `BOperation_Connect` | 増結。**増結相手編成の前作業コンテナを保持**(再帰) |
| `BOperation_Release` | 解結。**解結編成の後作業コンテナを保持**(再帰) |
| `BOperation_Out` | 出区(始発駅/増結編成の最初の作業のみ) |
| `BOperation_Outer` | 路線外始発(同上) |
| `BOperation_Junction` | 前列車接続(同上。出区・路線外以外は全てこれ) |
| `BOperation_NumberChange` | 運用番号変更 |

後作業 `EAOperation` は対称: `AOperation_Shunt / _Connect / _Release / _In(入区) / _Outer(路線外終着) / _Junction(次列車接続) / _NumberChange`。

### データスロットの主な意味(前作業。後作業はほぼ対称)
- `m_JikokuData1`: 入換=入換発時刻 / 増結=増結時刻(Null なら着時刻等から補完) / 解結=解結時刻 / 出区=出区時刻(ダイヤグラム丸印位置) / 路線外始発=路線外駅の発車時刻 / 前列車接続=探索起点時刻。
- `m_JikokuData2`: 入換=入換着時刻(Null なら発と同時) / 路線外始発=**当駅の着時刻**(Ver2 で駅時刻から作業側へ移動) / ※前列車接続=前列車接続時刻(在線表有り駅)。
- `m_JikokuData3`: ※前列車接続=前列車接続時刻(在線表無し駅)。
- `m_iIntData1`: 入換=入換前の番線 / 解結=解結する編成位置(0=後方,1=前方,2=前方以外) / 路線外始発=路線外発着駅 Index / ※前列車接続=前列車方向(-2〜2、在線表あり駅の縦線方向) / (後作業の次列車接続では)**次列車接続タイプ 0=別列車,1=種別変更,2=列車情報変更,3=同一列車扱い**。
- `m_iIntData2`: 解結=解結編成数(意味は BoolData1/IntData1 に依存) / ※前列車接続=前列車方向(在線表無し駅、-1/0/1)。
- `m_iIntData3`: ※前列車接続=前列車の終着駅 Order(自列車方向の EkiOrder に変換済み。反転駅判定用)。
- `m_bBoolData1`: 入換=「入換着時刻を当駅着時刻とみなす」 / 増結=増結編成を親編成の前に連結するか / 出区・路線外始発=割当運用番号が有効か(入出区連携) / ※前列車接続=種別変更で繋がっているか / 運用番号変更=運用番号順反転。
- `m_strOperationNumber1/2/3`: vector\<tstring\>。**連結編成 1 本ごとに 1 運用番号**を配列で保持(増結後運番、解結前運番、出区運番、仮運番、新旧運番、反転後運番など種類別)。
- `m_strInOutLinkCode`: 出区・路線外始発(前)/入区・路線外終着(後)の**入出区連携コード**。同一コードで入区→出区へ運番を自動引継ぎ。
- 包含: `m_CentDedBeforeOperationCont` / `m_CentDedAfterOperationCont` — 増結相手編成の前作業・解結編成の後作業を**入れ子**で保持(作業内での更なる増解結も可能)。

**前運用・後運用の「接続」はポインタ参照ではなくデータ的に疎**: 次列車への接続は「後作業末尾の `AOperation_Junction`(+接続タイプ)」と「次列車の前作業先頭の `BOperation_Junction`」の組であり、相手列車の同定は運用探索(CDedOperationConnecter)が時刻・番線・駅から都度解決して導出値(※印)を書き込む。

---

## 12. 不変条件まとめ(クラスコメント「制約」「操作のエラー検査・修正」欄より)

1. **駅時刻配列と駅数の一致**: 全列車の `CentDedEkiJikoku` 数 = 路線の駅数。列車側からの insert/erase は禁止。駅の追加・削除は Rosen → DiaCont → 各 Dia → RessyaCont → 各 Ressya に伝播(追加時は主本線 Index を初期番線に設定)。
2. **ダイヤ名一意**: `CentDedDia::m_strName` は DiaCont 内で一意・空不可。違反する insert/set/代入はエラー/例外。
3. **種別名非空**: コンテナ所属中の `CentDedRessyasyubetsu` の種別名は空文字列不可。
4. **種別 Index の追従**: 種別の挿入・削除で全列車の種別 Index をシフト。削除対象を指していた列車は 0 へ。範囲外は adjust で 0 へ。
5. **起点時刻 Null 不可**(`CentDedRosen::m_jikokuKitenJikoku`)。
6. **駅扱と時刻の整合**(§10)。駅扱変更時は前後作業も `adjustOperation(iType)` で修正。
7. **列車方向の固定**: コンテナ所属中の列車は代入でも方向不変。列車の方向は所属コンテナ(下り/上り)と一致するよう adjust。
8. **分岐・環状マップの再計算**: `CentDedEkiCont::adjustBrunchLoopByBrunchEdit/ByLoopEdit` 等により、駅編集・上位編集の度に各駅の `m_iEkiIndexLoop` 等を更新。

---

## 13. 処理クラス(アルゴリズム)

### 13.1 CDedRessyaSoater 系(列車ソート)
`entDed/CDedRessyaSoater.h`: 抽象基底。**列車インデクスの配列をソート**し(`sortRessyaIndex()` をオーバーライド)、その順序に従って `sortRessyaByRessyaIndexOrder()` が実列車を並べ替える template method 構成(CentDedRessya のコピーが遅いための性能設計)。派生:
- `CDedRessyaSoater_Ekiatsukai`: 指定駅時刻 Order の駅扱・時刻でソート。駅扱の優先順は「停車・通過 → (経由なし) → 運行なし」、時刻は非 Null 優先、**起点時刻基準の比較**。時刻表ビューの「時刻順ソート」の中核。
- `CDedRessyaSoater_Ressyabangou`: 列車番号→種別→列車名→号数。
- `CDedRessyaSoater_Ressyamei`: 列車名→号数→種別→列車番号。
- `CDedRessyaSoater_Ressyasyubetsu`: 種別→列車名→号数→列車番号。
- `CDedRessyaSoater_Bikou`: 備考。 `CDedRessyaSoater_OperationNumber`: 運用番号。 `CDedRessyaSoater_RessyaTrack`: 指定駅の番線(+駅扱)。
- `entDgr/CDedRessyaSoater_Transfer`: 『乗り継ぎソート』。CentDedDgrDia と推定時刻を使う(描画側の座標を利用するため entDgr に配置)。

### 13.2 CRessyaContUnifier(列車一本化)
`entDed/CRessyaContUnifier.cpp`。`unify(pMuiRessya, pEkiCont, progress)`:
- 列車番号・種別 Index をキャッシュ(get() が遅いため)。
- **列車番号が非空で同一 かつ 種別 Index が同一**の 2 列車を対象に、有効始発/終着駅で連続性を確認して一本化。
- `unify(cont, i, j)`(static): j 列車の各駅時刻のうち駅扱が停車/通過のものを i 列車へコピー(駅扱・非 Null の着発時刻・番線・前後作業。ただし方向的に重複する始発前作業/終着後作業はコピーしない)。その後 `adjustOperation()`、i を set、**j を erase**。

### 13.3 CDedOperationConnecter(運用接続・運用探索)
`entDed/CDedOperationConnecter.h/.cpp`(cpp 10,247 行 — entDed 最大)。`CentDedDia` 内の列車の前後作業を繋ぎ、運用番号を伝播させ、Dia の導出データ(§8)を構築する。
- 入力: `m_pDedRosen`(const)+ `m_pDedDia`(書込対象)。設定: 起点時刻、運番反転(`m_bOperationNumberReverse`)、起点時刻跨ぎ可否、パターンダイヤ設定。
- 3 モード: `operationConnectLight()`(簡易モード=接続のみ) / `operationConnect()`(通常モード=運用番号割当) / `operationConnectPatternDiagram()`。
- 中核データ: `m_contRessyaExist`(駅×番線ごとの在線時系列 list\<RessyaElement\>)、`m_contRessyaOperationElement`(方向×列車ごとの先端・終端・増解結作業の簡略図 OperationElement)、`m_contOutOuter`(出区・路線外始発の一覧 — 探索の起点)、`m_contNumberChange`、`m_contJunctionList`、`m_contConnectWaitList`(増結相手の運番未確定時の待機リスト)、運番→OperationTableContent のバッファ、入出区連携コード照合、カスタマイズ時刻表への挿入ストック各種。
- 流れ(ヘッダのメソッドコメントより): 出区・路線外始発から開始 → `junctionOperationElement()` で作業を辿り運番を割当て → 次列車接続なら `SearchRessyaElement()` で在線情報から次列車を発見して接続 → `insertOperationTableContentToBuffer()`/`addOperationTableContent()` で運用表を構築 → `completeCustomizeJikokuhyouContent()` でカスタマイズ時刻表列を確定。
- **導出値の書き戻し**: 前後作業の※印スロット(割当運番・接続時刻・接続方向等)と Dia の 3 つの導出コンテナ。

### 13.4 CentDedRessya_EkijikokuModifyOperation2(駅時刻一括変更コマンド)
`entDed/CentDedRessya_EkijikokuModifyOperation2.h`。UI からの時刻編集を表すコマンドオブジェクト:
- `m_bSetEkiatsukai` + `m_eEkiatsukai`(駅扱変更の有無と値)
- `m_eOperation : EOperation`(`OperationNop` / 指定時刻 Order 以降を `m_iSeconds` 秒繰下げ / `m_iJikokuOrderCopySrc` の時刻+`m_iSeconds` を設定、等)
- `execute(pRessya, aJikokuOrder)` で列車の指定時刻 Order に適用。

---

## 14. entDgr — ダイヤグラム描画用エンティティ(`entDgr/`)

entDed(編集モデル)から**描画用に変換したビュー・モデル**。座標系は『ダイヤグラムエンティティ座標』で、X = 時刻(**秒**。午前 0 時(00:00)からの経過秒数。日跨ぎのアンラップにより負や 24:00 以上にもなる。INT_MIN=Null。起点時刻は左端座標 `m_iDgrXPosMin` を決めるのに使われる)、Y = 駅間距離(**秒**単位の幅、既定 60)。

| クラス | 役割 / 主フィールド |
|---|---|
| `CentDedDgrDia` | ルート。`readCentDedRosen()` で CentDedRosen から構築。`m_strName`, `m_iDgrXPosMin`(左端 X。0 なら 00:00:00), `m_iDgrYSizeEkikanDefault`(=60), `m_iEnableOperation`, `m_CentDedDgrEkiCont`, `CMuiCopied<CentDedDgrRessyasyubetsu>`, 下り/上りの DgrRessya 群 |
| `CentDedDgrEki` | 駅の描画属性スナップショット: `m_strEkimei`, `m_bIsSyuyoueki`, `m_iEkikanSaisyouSecKudari/Nobori`(**駅間最小運転秒 — 基準運転時分**), `m_iDgrYSize`, 分岐・環状 4 項目, 在線表表示 `m_iDiagramTrackDisplay`/`m_iDiagramTrackIndex`, `m_MuCentDedDgrEkiTrack2`, `m_strOuterTerminalEkimei` |
| `CentDedDgrEkiTrack2` | 番線の描画用スナップショット(多重度 駅:番線数) |
| `CentDedDgrRessyasyubetsu` | 種別スナップショット(多重度 = 路線の種別数) |
| `CentDedDgrRessya` | 列車 1 本。`readCentDedRessya()` で CentDedRessya から生成。`m_DgrXZone`(X 範囲)、駅数分の `CentDedDgrEkijikoku`、`CentDedDgrRessyasenCont`(列車線)、`CentDedDgrRessyaTrackLineCont`(在線線)。`modifyDgrXPos(iSeconds)` で全体シフト(パターンダイヤ用) |
| `CentDedDgrEkijikoku` | `m_eEkiatsukai`, `m_iDgrXPosChaku/Hatsu`(着発の X 座標。INT_MIN=Null)、`m_iDgrXPosRessyasen`(通過駅での列車線交点 X)、`m_iRessyaTrackIndex`, `m_bShouldRessyajouhouDraw` |
| `CentDedDgrRessyasen` | 折れ線分解された列車線 1 直線。`m_iRessyasenKitenEkiOrder` / `m_iRessyasenSyuutenEkiOrder`(-1=無効) |
| `CentDedDgrRessyaTrackLine` | 在線表上の 1 直線(列車:在線線コンテナ = 1:1、コンテナ:線 = 1:N) |
| `CEnumRessyasen` | 指定描画領域(CdDcdZoneXy)と交差する列車線の列挙イテレータ(描画ループのエンジン) |

**示唆**: entDgr は「時刻→秒座標」変換と折れ線分解を行うだけの純粋な導出層。Web では描画時にオンザフライ計算するか、同様の派生モデルを memoize すればよい。

---

## 15. Web 再実装に向けた論点

### 難所
1. **CDedOperationConnecter(運用探索)が最大の移植難所**(単体 1 万行)。駅×番線の在線時系列、増解結の入れ子(前作業の中に相手編成の前作業)、運番配列(編成 1 本=運番 1 個)、入出区連携コード、起点時刻跨ぎ、運番反転、と状態が多い。ただし入出力は明確: 入力 = 列車+前後作業(ユーザー設定分)、出力 = ※印の導出スロット + Dia の 3 導出コンテナ。**「導出計算」として純関数化できる**。
2. **前後作業の共用体的スロット設計**(BoolData1/IntData1/JikokuData1... の意味が作業種類で変わる)。TS では判別可能ユニオン(discriminated union)に正規化すべき。ただし oud2 ファイルはスロット形式で書かれているはずなので、I/O 層でのマッピング表が必要(ファイル形式は別分析を参照)。
3. **分岐駅・環状線**: 駅は 1 次元配列のまま、`m_iBrunchCoreEkiIndex`/`m_iLoopOriginEkiIndex` と派生マップ(`m_iEkiIndexLoop` 等)で疑似的に樹形/環状を表現している。編集時の再計算ロジック(`adjustBrunchLoopBy...`)の仕様理解が必要。
4. **時刻の 24h サイクリック+起点時刻相対比較**。全比較・ソート・接続探索が「起点時刻を最小とみなす」比較に依存。Web 版でも Jikoku 型(秒 int + null)と compare(kiten) を最初に固めるべき。
5. **カスタマイズ時刻表の列構成(CustomizeJikokuhyouContent)**も運用探索の出力で、表示都合の情報(矢印位置、環状表示、路線外扱い表示)が濃い。ビューモデルとしてドメインから分離可能。

### Windows / C++ 依存で単純化できる点
- `CMuiCopiedParent` の値コピー・親逆参照・offsetof ハック(`CXBeforeOperationCont::getBeforeOperation()` は offsetof で外側オブジェクトを逆算している)は、TS ではプレーンなオブジェクトツリー or 正規化ストアで置換。
- `tstring`(TCHAR)/ `CdColorProp` は string /色値型へ。Shift-JIS はファイル I/O 層のみの関心事。
- 種別 Index・駅 Index の手動シフト同期は、ID 参照(駅は既に `m_iID` を持つ)にすれば大幅に単純化できる。ただし **oud2 ファイル形式・既存 UI 操作は Index ベース**なので互換層は必要。
- 性能ハック(index ソート、列車番号キャッシュ)は、V8 では素直な実装で足りる可能性が高い(推測)。

### 移植時に落としやすい仕様(要注意)
- 駅扱 `Ekiatsukai_None` 設定時の副作用(時刻 Null 化・番線 0・作業全削除)。
- 着/発時刻の相互補完(`getChakujikoku(true)` 等)と `adjustByEkijikokukeisiki` の詰め替え規則。
- 列車の Null 状態(空行)と、コンテナ所属中の方向不変。
- `subJikoku` の「絶対値 12 時間以下の側」規則。
- 一本化(Unifier)の条件: 列車番号非空+一致、種別一致、有効発着駅の連続性、始発前作業/終着後作業のコピー除外。
- 駅 ID の自動採番(同名駅対応)。
- CdDedJikoku(-1) は Null ではなく 23:59:59。
