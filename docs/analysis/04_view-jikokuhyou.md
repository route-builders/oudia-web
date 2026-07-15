# 04. 時刻表ビュー・駅時刻表ビュー分析

対象モジュール:

- `origin/DiagramEdit/DiagramEdit/ViewJikokuhyou/` (時刻表ビュー本体。約7万行・最大モジュール)
- `origin/DiagramEdit/DiagramEdit/ViewEkiJikokuhyou/` (駅時刻表ビュー・駅時刻表一覧ビュー)
- マニュアル: `origin/DiagramEdit/manual/oudia_manual/c03_reference/c05_jikokuhyouview/jikokuhyouview.html`、`c02_usersguide/c03_ressyanyuuryoku/` 配下

本書の記述は、特記なき限りソースコードで確認した事実である。推測は【推測】と明記する。

---

## 1. 概要

時刻表ビューは「列車を1列(縦)、駅×着/発/番線等を1行(横)とする Excel 風グリッド」で、列車データ(`CentDedRessya`)の主たる編集 UI である。ダイヤ(`CentDedDia`)ごと・列車方向(下り/上り)ごとに1つのサブドキュメント/ビューが開かれる(`CJikokuhyouDoc` の Docstr = "<ダイヤ名>\n<列車方向>"。`ViewJikokuhyou/CJikokuhyouDoc.h`)。上下の切替は「ビュー内トグル」ではなく、下り時刻表・上り時刻表が別ビューとして開かれる方式である。

駅時刻表ビュー(`ViewEkiJikokuhyou`)は、1駅の発車時刻表(駅掲示時刻表スタイル: 時×分)を読み取り専用で表示するビューで、ダイヤ×方向×駅ごとに開く。

グリッド描画は自前ライブラリ `libs/DcDrawLib` の `CWndDcdGrid`(WndDcdGrid3)を基盤とする。DcDrawLib の詳細は別書に譲る。

用語注意: このコードベースでは「X列」=画面上の縦の列(列車)、「Y列」=画面上の横の行(項目)である。以下「行(Y列)」「列(X列)」と表記する。

---

## 2. 構成要素カタログ

### 2.1 ViewJikokuhyou (時刻表ビュー)

| クラス | ファイル | 役割 |
|---|---|---|
| `CJikokuhyouDoc` | `CJikokuhyouDoc.h/.cpp` | サブドキュメント。ダイヤ名・`ERessyahoukou`(下り/上り)・カスタマイズ時刻表フラグ `m_bCustomizeDisplayMode` を保持。SetTitle() の文字列から決まる |
| `CJikokuhyouView` | `CJikokuhyouView.h/.cpp` | CView。`CWndJikokuhyou`(グリッド)を1つ包含するだけの薄いラッパ。印刷対応(OnPreparePrinting 等)。外部から `setFocusToRessyaIndex(iRessyaIdx, iEkiOrder)`・`openCDlgEkijikokuProp()`・`openCDlgRessyaProp()` 等でフォーカス/ダイアログ操作可能(ダイヤグラムビュー等からの連携用) |
| `CWndJikokuhyou` | `WndJikokuhyou/CWndJikokuhyou.h/.cpp` (1,413+3,997行) | グリッドウインドウ本体。`CWndDcdGrid` 派生。状態機械・表示オプション・コマンドハンドラ(約90個の afx_msg)を持つ |
| `CWjkStateMachine` | `WndJikokuhyou/CWjkStateMachine.h/.cpp` | 『状態』(State パターン)のコンテナ。カレント状態 index を持ち、遷移時に onExit()/onEnter() を呼ぶ |
| `CWjkState` | `WndJikokuhyou/CWjkState.h/.cpp` | 状態の抽象基底。すべてのビューコマンド `On..._Process(BOOL bQueryEnable)` の既定実装(ほぼ「無効」を返す)を提供 |
| `CWjkState_Ressyahensyu` | `WndJikokuhyou/CWjkState_Ressyahensyu.h/.cpp` (14,748行) | 『列車編集モード』(通常モード)。ほぼ全編集コマンドの実装 |
| `CWjkState_Renzoku` | `WndJikokuhyou/CWjkState_Renzoku.h/.cpp` (1,677行) | 『連続入力モード』。分2桁のみの高速時刻入力 |
| `CCellBuilder` | `WndJikokuhyou/CCellBuilder.h/.cpp` (10,808行) | 通常モードのセル内容(テキスト・フォント・色・罫線)構築。表示書式の中心 |
| `CCellBuilderCustomize` | `WndJikokuhyou/CCellBuilderCustomize.h/.cpp` (12,979行) | カスタマイズ時刻表モードのセル構築 |
| `CdXColSpec` / `CdXColSpecCont` | `JikokuhyouColSpec/` | X列番号 ↔ 表示内容(駅名/着発/列車/新規列車)の対応表 |
| `CdYColSpec` / `CdYColSpecCont` | `JikokuhyouColSpec/` | Y列番号 ↔ 表示内容(列車番号/種別/…/駅時刻/備考)の対応表。行レイアウトの生成規則を持つ |
| `CDlgEkijikokuProp` + `CPropEditUi_EkiJikoku` | `CDlgEkijikokuProp.h/.cpp`, `CPropEditUI_Ekijikoku.h/.cpp` | 『駅時刻のプロパティ』ダイアログ。駅扱・着時刻・発時刻・発着番線の編集。時の補完・繰上げ繰下げを実装 |
| `CDlgRessyaProp` + `CPropEditUi_Ressya` | `CDlgRessyaProp.h/.cpp`, `CPropEditUi_Ressya.h/.cpp` | 『列車のプロパティ』ダイアログ(列車番号・種別・列車名・号数・備考等) |
| `CDlgOperationProp` + `CPropEditUI_Operation` | `CDlgOperationProp.h/.cpp` (5,160行), `CPropEditUI_Operation.h/.cpp` (4,137行) | 『作業のプロパティ』ダイアログ(運用機能の駅作業。OuDiaSecond 拡張) |
| `CDlgJikokuhyouViewProp` | `CDlgJikokuhyouViewProp.h/.cpp` | 『時刻表ビューのプロパティ』。貼り付け移動量(分+秒)・貼り付け移動量(列車番号)・同(号数)・駅時刻ソート方式(駅扱/乗継)・末尾要素基準比較 `m_bCompareBottom` |
| `CDlgModifyEkijikokuOperation2` | `CDlgModifyEkijikokuOperation2.cpp` | 『駅時刻変更』ダイアログ(一括変更操作の指定) |
| `CDlgOuJikokuhyouCsvExport` | `CDlgOuJikokuhyouCsvExport.h/.cpp` | 時刻表 CSV エクスポートダイアログ(表示オプション一式を引数に取り、画面表示と同等の CSV を出力) |

### 2.2 ViewEkiJikokuhyou (駅時刻表ビュー)

| クラス | ファイル | 役割 |
|---|---|---|
| `CEkiJikokuhyouDoc` | `CEkiJikokuhyouDoc.h/.cpp` | サブドキュメント。ダイヤ名・方向・駅ID (`m_iEkiID`) を保持(Docstr = "ダイヤ名\n列車方向\n駅Index") |
| `CEkiJikokuhyouView` | `CEkiJikokuhyouView.h/.cpp` | CView ラッパ |
| `CWndDcdGridEkiJikokuhyou` | `CWndDcdGridEkiJikokuhyou.h/.cpp` (3,543行) | 駅時刻表グリッド。表示専用(時刻編集なし) |
| `CEkiJikokuhyouListDoc/View`, `CWndDcdGridEkiJikokuhyouList` | 同名ファイル | 『駅時刻表一覧』ビュー。行=駅、列=[駅名/下り/上り] の選択表。ここから各駅の駅時刻表を開く |
| `CdEkiJikokuhyouXColSpec/YColSpec(+Cont)` | `EkiJikokuhyouColSpec/` | X列=[時表示, 列車0..n]、Y列=[ヘッダ行, (時ごとに)種別行・分行・行き先行・番線行] |
| `EkiJikokuhyouContent` (struct) | `CWndDcdGridEkiJikokuhyou.h` | 1マス分の内容: `iMinute`(分。-1なら種別変更表示)・`iRessyaSyubetsu`・`iSyuuchakuEkiOrder`(-1=環状運転, -2=行き先「環状線」)・`iOuterShuchakuekiIndex`・`iRessyaTrackIndex`・`aRessyaProperty`(方向+列車Index)・`bIsShihatsu` |
| `CconvEkiJikokuhyouCsv` | `CconvEkiJikokuhyouCsv.h/.cpp` | 駅時刻表 CSV エクスポート |

---

## 3. グリッドの構成

### 3.1 列(X列)のレイアウト — `CdXColSpecCont::scan()` (`JikokuhyouColSpec/CdXColSpecCont.cpp`)

```
X=0: ColumnType_Ekimei      (駅名列: 行見出し)
X=1: ColumnType_Chakuhatsu  (着発列: 「着」「発」「番線」等の行見出し補助)
X=2 .. 2+列車数-1: ColumnType_Ressya (m_iRessyaIndex = X-2)
末尾: ColumnType_NewRessya  (新規列車追加位置。m_iRessyaIndex=列車数)
```

- 左2列は固定列: `setXFixColumnCount(2)` (`CWndJikokuhyou.cpp` OnCreate、行2763)。横スクロールしても駅名・着発列は残る。
- セル選択(列車選択)の許容範囲は X∈[2, 2+列車数) に制限される(`CWjkState_Ressyahensyu::OnUpdate` 内 `setColumnNumberSelectLimit`)。選択モードは `CSelect::SelectMode_XColumn`(列=列車単位の選択)。
- カスタマイズ時刻表モードでは列車列は `CentDedDia` の `vector<CustomizeJikokuhyouContent>`(直通チェーン単位で結合された表示列定義)の数になる。

### 3.2 行(Y列)のレイアウト — `CdYColSpec::EColumnType` (`JikokuhyouColSpec/CdYColSpec.h`)

`CdYColSpec` は (行種別, 駅Order, OperationIndex) の3つ組。行種別の全列挙(定義順):

- ヘッダ部(列車プロパティ行): `ColumnType_Ressyabangou`(列車番号) / `ColumnType_OperationNumber`(運用番号; 段数分繰返し) / `ColumnType_Ressyasyubetsu`(列車種別) / `ColumnType_Ressyamei`(列車名) / `ColumnType_Gousuu`(号数) / `ColumnType_Gou`(「号」表示) / `ColumnType_ShihatsuEkimei`(始発駅名) / `ColumnType_Operation_Shihatsu1..4`(始発駅作業) / `ColumnType_ShuchakuEkimei`(終着駅名) / `ColumnType_Operation_Shuchaku1..3`(終着駅作業) / `ColumnType_Outer_Shihatsu1,2`(路線外始発駅)
- 駅ごとの行 (`isEkiComponent()`=true, 駅Order 有効; 駅ごとに以下のサブセットが繰り返される):
  - カスタマイズ用: `ColumnType_EkiPrevRessyabangou`〜`ColumnType_EkiPrevGou`(前列車情報)・`ColumnType_EkiOuter_Shihatsu1,2`(駅別路線外始発)
  - `ColumnType_Ekijikoku_Nyuusen`(入線時刻; 運用機能時)
  - `ColumnType_Ekijikoku_Chaku`(着時刻)
  - `ColumnType_BeforeOperationBefore1..4` / `ColumnType_BeforeOperation1,2`(×n) / `ColumnType_BeforeOperationAfter1..3`(前作業群; 運用機能時)
  - `ColumnType_Track`(番線)
  - `ColumnType_AfterOperationBefore1..4` / `ColumnType_AfterOperation1,2`(×n) / `ColumnType_AfterOperationAfter1..3`(後作業群)
  - カスタマイズ用: `ColumnType_EkiRessyabangou`〜`ColumnType_EkiGou`(種別変更後の列車情報)
  - `ColumnType_Ekijikoku_Hatsu`(発時刻)
  - カスタマイズ用: `ColumnType_EkiOuter_Shuchaku1,2`
- フッタ部: `ColumnType_Outer_Shuchaku1,2`(路線外終着駅) / `ColumnType_Bikou`(備考)

### 3.3 行の生成規則 — `CdYColSpecCont::scan()` (`JikokuhyouColSpec/CdYColSpecCont.cpp`)

入力: `CentDedEkiCont`(駅リスト)・方向・各種表示フラグ。生成ロジックの要点:

1. 列車番号行は常に生成。運用番号行は運用機能が通常モード(`iEnableOperation > 1`)のとき `iOperationNumberRows` 段生成。種別行は常に生成。列車名・号数・「号」行は `bDisplayRessyamei` のとき生成。
2. 始発駅名・終着駅名行は「編集モード(非カスタマイズ)では常に」「カスタマイズでは `bDisplayShihatsuShuchakuEkimei` のとき」生成。始発/終着駅作業行・路線外始発/終着行は編集モードのみ。
3. 駅ごとの行は、駅を方向順(`pCentDedEkiCont->getMuPtr(eRessyahoukou)`。上りは駅リストの逆順ビュー)に走査して生成する。**駅Order は方向別の並び順**である。
   - 着時刻行: 編集モードでは「駅の `getChakujikokuHyouji()`(駅時刻形式による着表示) または [全時刻を表示] `bDisplayAllJikoku`」のとき。カスタマイズでは駅の `getJikokuhyouChakuJikokuDisplay()` のとき。
   - 発時刻行: 同様に `getHatsujikokuHyouji() || bDisplayAllJikoku`(カスタマイズでは `getJikokuhyouHatsuJikokuDisplay()`)。
   - 番線行: `aEki.getJikokuhyouTrackDisplay()`、または編集モードで `!aEki.getJikokuhyouTrackOmit()`。
   - 作業行群: 編集モード時、駅の `getJikokuhyouBeforeOperation()` 等の設定値に応じ生成(運用機能拡張)。
4. `m_iColumnNumber_Ekijikoku_begin/end` に駅時刻行の範囲(行番号)を記録する。
5. 末尾に(編集モードなら路線外終着2行と)備考行を生成。

`ColumnNumberFromSpec(spec, bResolveSameStation)` は逆引きで、対応行が非表示のときの代替探索を持つ: 列車プロパティ行なら最初の列車プロパティ行、着/発時刻なら「同駅の発時刻→それも無ければ駅Order がそれ以下の最後の時刻行」、備考なら最後の非備考行(フォーカス復元用)。

### 3.4 固定行

`CWndJikokuhyou::OnCreate`/`OnUpdate_All`(`CWndJikokuhyou.cpp` 行267-271, 2806-2807)で、ヘッダ部(列車番号〜終着駅作業等、モード・設定に応じ可変)の行数を計算し `setYFixColumnCount(ヘッダ行数-1)` を設定。つまり**列車プロパティ行はすべて上部に固定され、駅時刻行だけが縦スクロールする**。基本の行数計算: 3(列車番号+種別+備考)+運用番号段数+3(列車名系)+2(始発/終着駅名)+4以上(駅作業; 編集モードのみ)。

### 3.5 上下ダイヤと表示行の絞り込み

- 下り/上りは別ドキュメント。駅Order は方向ごとに反転(上りでは末尾駅が Order 0)。
- 表示行の絞り込みは駅のプロパティ(`CentDedEki` の駅時刻形式・番線表示等)+ビューのトグル([全時刻を表示]、[通過駅の駅時刻を表示]等)で決まる。列車列の絞り込み(非表示)は編集モードには無い(全列車表示)。カスタマイズ時刻表・駅時刻表では種別の `getHidden()` による非表示がある。

---

## 4. 状態機械(モード)

`CWndJikokuhyou::EStateIdx` (`CWndJikokuhyou.h`):

- `StateIdx_Ressyahensyu = 0` … 列車編集モード(既定)
- `StateIdx_Renzoku` … 連続入力モード

`CWjkStateMachine` がカレント状態を保持し、`OnKeyDown/OnKeyUp/OnChar/OnLButtonDblClk/OnSetFocusCell/OnUpdate` および全メニューコマンド `On..._Process(BOOL bQueryEnable)` を委譲する。`bQueryEnable=TRUE` は「実行可否判定のみ」(メニューの Enable 制御)、`FALSE` は実行。負の戻り値がエラー。

### 4.1 列車編集モード(`CWjkState_Ressyahensyu`)

- **文字/数字キー押下 → 該当ダイアログを自動で開き、キー入力をダイアログに転送する**(`OnKeyDown`、行2514-2546)。`CKeyinputSenderToModalDlg` が押下キーをダイアログのエディットボックスへ WM_KEYDOWN/UP として再送する。つまり「セルに直接タイプ」はできず、タイプ開始で即ダイアログが開いてそこに文字が入る。
- どのダイアログが開くかはフォーカス行で決まる(`execJikokuhyouPropDlg`、行213-330)。優先順: (1)駅名列上→駅のプロパティ (2)駅時刻/番線行→『駅時刻のプロパティ』 (3)作業行→『作業のプロパティ』 (4)列車プロパティ行→『列車のプロパティ』 (5)運用番号行→運用表へ移動。ダブルクリックも同じ(`OnLButtonDblClk`)。Alt+Enter 版 `execAltJikokuhyouPropDlg` は判定順が異なる(駅時刻より作業を優先)。
- フォーカスが `ColumnType_NewRessya`(最右の空白列)にあるときは「新規列車を末尾に追加」の動作になる(bInsert=true)。

### 4.2 連続入力モード(`CWjkState_Renzoku`)

始発駅から順に、**分2桁だけ**で駅時刻を入力する高速モード。[駅時刻]→[連続入力](Ctrl+T)で開始。

- 入場条件 `canEnter()`(`CWjkState_Renzoku.cpp` 行464-)は3条件: (1)フォーカスが列車の列 (2)駅時刻セル (3)その位置より前に駅時刻が入力済みの駅がある。満たさなければ即列車編集モードへ戻る。加えて [連続入力] コマンド自体(`OnJikokuhyouRenzoku_Process`、`CWjkState_Ressyahensyu.cpp` 行5578-)はカスタマイズ時刻表モードでは無効。
- 内部状態: `m_iXColumnNumberFocus`(編集中列)と `m_strMinutes`(入力途中の分文字列)。
- `OnChar`(`CWjkState_Renzoku.cpp` 行830-1010):
  - 1文字目は '0'〜'5' のみ受理(分の十の位)。2文字目は '0'〜'9'。
  - 2桁揃ったら、直前の駅時刻 `jikokuRev`(`findrevJikoku` で遡って取得)の**「時」を引き継いで時刻を合成**し、`jikokuCurrent.subJikoku(jikokuRev) < 0` なら +1時間する(常に直前駅以後の時刻になる)。
  - 駅扱が運行なしだった場合は時刻設定で自動的に停車になり、基準番線(`StandardRessyaTrackIndexSearch`)を適用。その後、分岐駅・環状線の整合調整(`getEkiOrderBrunchLoop` 系)と `adjustOperation()` を行い、`CRfEditCmd_Ressya` を `executeEditCmd` で実行(Undo 可能)。フォーカスは次の駅時刻セルへ(`calcCellToNext`; 移動対象は駅時刻セル限定)。
- `OnKeyDown`: BackSpace は「入力途中なら1文字訂正」「未入力なら前の駅時刻セルへ戻る」。Esc で列車編集モードへ復帰。終着(最下段)まで入力すると自動終了。
- 画面表示: 編集中セルに `printf("%2d%-2s", 直前駅の時, 入力中の分)` のテキストを直接描画する(`update_updateScreen`、行260-360)。ステータスバーに「連続入力モード」を表示(`OnUpdateINDICATOR_PasteZoubun_Process`)。
- モード中はセル選択禁止(`SelectMode_NONE`)。モード中に使える追加コマンドは [時刻消去]/[通過]/[通過-停車]/[経由なし](継続)のみ(`CWjkState_Renzoku.h` 行373-441 でオーバーライド)。他の更新(列車の追加削除を伴う編集等)が発生すると列車編集モードへ強制遷移。

---

## 5. 時刻の入力仕様

### 5.1 時刻文字列の解釈 — `CdDedJikoku::decode()` (`entDed/CdDedJikoku.cpp` 行545-)

受理形式(コロン有無どちらも可): `"13:15:45"` `"13:15"` `"131545"` `"1315"` `"9:15:45"` `"915"` `"91545"`。アルゴリズム:

1. 空文字列 → Null 状態(=時刻なし)で成功。
2. コロンが無ければ末尾から2桁ごとにコロンを挿入(→ 3桁 "915" は "9:15")。
3. 5文字以下なら ":00"(秒)を付加。7文字以下なら先頭に "0" を付加。先頭がスペースなら "0" に置換。
4. "HH:MM:SS" の8文字になったら時分秒を検証(0≦h<24, 0≦m<60, 0≦s<60)。
5. 戻り値: 0以上=成功 / -1=項目数不足(2桁以下等) / -2=時分秒の表記不正。

### 5.2 時の補完(短縮入力) — `getJikokuFromUI()` (`CPropEditUI_Ekijikoku.cpp` 行116-190)

『駅時刻のプロパティ』ダイアログの着/発時刻欄で、**数字2桁のみ**を入力した場合(decode が -1 を返し、かつ直前の駅時刻 `jikokuRevOrder` が存在する場合):

- 入力2桁を分(0〜59)とみなし、`jikokuRevOrder.getHour()` を時として合成。
- `bBefore=false`: 合成時刻が直前時刻より前なら +1時間。→ 常に「直前の駅時刻以後」になる。**『駅時刻のプロパティ』では着時刻・発時刻とも常に `bBefore=false`**(呼び出しは同ファイル行398・432 の2箇所のみ)。
- `bBefore=true`(合成時刻が基準より後なら -1時間 = 基準時刻以前へ補完)は、『作業のプロパティ』側の同名 static 関数(`CPropEditUI_Operation.cpp` 行121; 別実装)で、作業時刻を着時刻等の基準より前になるよう補完する際に使われる(同 行1190 ほか)。
- 補完の基準: 着時刻欄は「前駅の時刻」、発時刻欄は「同駅着時刻(あれば)または前駅の時刻」(`UiDataFromUi` 側の呼び出し、行374-432)。始発駅では基準が無いので補完されない。
- 補完・確定のタイミングはフォーカス移動時(EN_KILLFOCUS)と OK 押下時。

なお表示・入力の書式は `g_CdDedJikokuConv`: コロンなし・時の先頭ゼロ省略・秒は0なら省略。

### 5.3 繰上げ・繰下げ

- 『駅時刻のプロパティ』の[駅時刻の繰上げ・繰下げ]チェック(`bModifyHatsujikoku`; ビュー単位で記憶)が ON の場合、時刻書き込みに `pRessya->modifyCentDedEkiJikoku()` を使う(`CPropEditUi_EkiJikoku::UiDataToTarget`、行578-650)。これは対象駅の変更差分を**それ以後の全駅時刻へ伝播**させる(繰上げ/繰下げ)。OFF なら `setCentDedEkiJikoku()`(当該駅のみ)。
- ダイアログ内でも、着時刻を変更すると同駅の発時刻が同量シフトする(マニュアル c01_ekijikokudlg)。
- ダイアログには ±1分/±5分/±任意秒1/±任意秒2 の増減ボタンがある(`CDlgEkijikokuProp.h` の OnBnClicked... 群)。

### 5.4 特殊入力キー(ショートカット)

アクセラレータ `IDR_DOCVIEW_Jikokuhyou ACCELERATORS`(`DiagramEdit.rc` 行1481-1534)より:

| キー | コマンド |
|---|---|
| テンキー'-' / Ctrl+'-' | [通過](時刻を消去して通過扱い) |
| Alt+'-' | [通過-停車](時刻維持のまま通過↔停車トグル) |
| テンキー'/' / Ctrl+Shift+'-' | [経由なし] |
| Ctrl+Del | [時刻消去] |
| Del | [消去](列車1本またはセル種別に応じた消去) |
| Ctrl+U / Ctrl+I | [当駅始発] / [当駅止り] |
| Ctrl+Shift+U / Ctrl+Shift+I | [直通化] / [分断] |
| Ctrl+T | [連続入力] |
| Ctrl+R / Ctrl+E | [駅時刻を挿入] / [駅時刻を削除] |
| Ctrl+M / Ctrl+'.' | [駅時刻変更...] / [駅時刻変更の再実行] |
| Ctrl+J / Ctrl+Shift+J | [-1分し次へ] / [-1分] |
| Ctrl+K / Ctrl+Shift+K | [フォーカスを次へ] / [フォーカスを前へ] |
| Ctrl+L / Ctrl+Shift+L | [+1分し次へ] / [+1分] |
| Ctrl+';' / Ctrl+Shift+';' | [-任意秒1] / [-任意秒2] (VK_OEM_PLUS。`EkijikokuDecAnySecNoMove`/`DecAny2SecNoMove`) |
| Ctrl+':' / Ctrl+Shift+':' | [+任意秒1] / [+任意秒2] (VK_OEM_1。`EkijikokuIncAnySecNoMove`/`IncAny2SecNoMove`) |
| Ctrl+Alt+J/L 等 | Rev 系(フォーカス位置**以前**の駅時刻を対象にシフト。`modifyRessyaJikokuRev`) |
| Enter | [駅時刻のプロパティ] / Ctrl+Enter [列車のプロパティ] / Alt+Enter [作業のプロパティ] / Shift+Enter [ビューのプロパティ] |
| Ctrl+X/C/V, Ctrl+Shift+V, Ctrl+Shift+C, Ctrl+Alt+C | 切り取り/コピー/貼り付け/時刻のみ貼り付け/作業のコピー/列車情報のコピー |
| Ctrl+←/→ | [左へ]/[右へ](列車の並び順入替。`CRfEditCmd_RessyaSwap`) |
| Ctrl+B / Ctrl+'\\' | [運休](Canceled トグル) |
| F8 | [ダイヤグラムへ移動] |
| Ctrl+',' / Ctrl+Shift+',' | [基準運転時分に合わせる] / [基準運転時分を基に始発/終着駅を変更] |

補足: ±1分系コマンド(Ctrl+J/L)はフォーカス行の種別で多態的に動作する(`OnJikokuhyouEkijikokuDec_Process` の iType 分岐、`CWjkState_Ressyahensyu.cpp` 行6046-): 駅時刻行→時刻シフト(その駅以後すべて; `modifyRessyaJikoku`)、番線行→番線を前/次へ変更、作業行→作業データ変更、列車番号行→列車番号±1、種別行→種別を前/次へ、路線外駅行→路線外駅変更。

### 5.5 通過・経由なし等の編集動作の実体

例 [通過] `OnJikokuhyouTsuuka_Process`(`CWjkState_Ressyahensyu.cpp` 行4802-): 選択列車それぞれについて `Ekiatsukai_Tsuuka` を設定し、**着・発時刻を Null に消去**、運行なし/経由なしからの変更時は基準番線を設定。分岐・環状の駅扱補正(`AdjustBrunchLoop`)後、コマンド実行し `moveFocusCellToNext(true)`。[通過-停車] は時刻を維持したままトグル。[時刻消去] は時刻のみ削除(通過/経由なしの駅では駅扱が運行なしに変わる)。[当駅始発]/[当駅止り] はフォーカス駅より上/下をすべて運行なしへ。[分断] は1列車を2本に分割(始発・終着駅では不可、時刻未設定駅では不可)。[直通化] はA駅止まり+A駅始発を1本に接続。

---

## 6. 編集操作の全リストとコマンド生成

### 6.1 コマンド生成パターン — `CWndJikokuhyou::createCmd(ECreateCmd)` (`CWndJikokuhyou.h` 行140-260 のドキュメントコメント)

全編集は `CRfEditCmd_Ressya`(「ダイヤ×方向の列車配列の範囲 [iDiaIndex, +iIndexSize) を、新しい列車コンテナで置換する」コマンド)として表現される。生成モードは4種:

- `ECreateCmd_NewItem`: フォーカス位置への新規列車挿入(空列車1本、削除0)。使用: 貼り付け・列車を挿入・新規位置でのプロパティ。複数選択中は不可。
- `ECreateCmd_Focus`: フォーカスセルの1列車のコピーを対象(置換1本)。使用: 時刻のみ貼り付け・連続入力・直通化・分断、連続入力モードの各操作。
- `ECreateCmd_Select`: 選択列車(非連続選択含む; `CaMuiSelect` に選択状態が反映される)を対象。使用: 切り取り・コピー・消去・時刻消去・通過・通過-停車・経由なし・当駅始発・当駅止り・駅時刻の挿入/削除・駅時刻変更(+再実行)・連続1分修正・プロパティ変更。
- `ECreateCmd_All`: 全列車(選択があれば選択範囲)。使用: 最小所要時間列車に移動・並べ替え・列車番号で一本化。

`CRfEditCmd_Ressya`(`DedRosenFileData/EditCmd/CRfEditCmd_Ressya.h`)は `m_iDiaIndex`・`m_ERessyahoukou`・`m_iIndexDst`・`m_iSizeDst`・`m_CentDedRessyaContSrc`(追加する列車のコピー)・`m_CaMuiSelect`(部分選択アダプタ)・`m_bWaitOperationConnect`(連続入力時の運用探索抑止)を持つ。実行は `CDiagramEditDoc::executeEditCmd(pCmd)` 経由で、これが Undo/Redo スタックを構成する(execute() が削除した列車を `m_pCentDedRessyaContOld` に保持)。

**Undo 対象操作の種類**: 時刻表ビュー由来の Undo 可能操作はほぼ2種類のコマンド型に集約される — `CRfEditCmd_Ressya`(列車の追加/削除/置換=あらゆる列車編集)と `CRfEditCmd_RessyaSwap`([左へ]/[右へ] の並び順入替)。加えて運用機能有効時は第3の型 `CRfEditCmd_Operation` も本ビューから実行される: [運用の更新](F5、`OnJikokuhyouUpdateOperation_Process`、`CWjkState_Ressyahensyu.cpp` 行9506)と、運用更新抑止の解除時(`CWndJikokuhyou::setOperationUpdateStop`、`CWndJikokuhyou.cpp` 行1560)。いずれも `executeEditCmd` 経由なので Undo スタックに載る。他ビュー由来を含む `CRfEditCmd_Eki`/`CRfEditCmd_Ressyasyubetsu`/`CRfEditCmd_Operation` 等の実行時は OnUpdate のヒント(`CRfEditCmdHolder`)を見て全更新/差分更新/無視を判定する(`CWjkState_Ressyahensyu::OnUpdate`、行2400-2500)。

### 6.2 編集操作一覧(列車編集モード)

| 操作 | 実装 | 動作要点 |
|---|---|---|
| 切り取り/コピー/消去 | `OnEditCut/Copy/Clear_Process` | 列車(列)単位。複数選択可。クリップボードへ格納(独自形式)。格納時に貼り付け移動量の累積値をリセット |
| 貼り付け | `OnEditPaste_Process` | フォーカス位置に挿入。クリップボード列車の全駅時刻に `m_jikanPasteIdouryou`(貼り付け移動量; 秒)を**累積加算**(`m_jikanPasteIdouryouPrevValue += m_jikanPasteIdouryou`)。列車番号・号数にも同様の移動量(`m_iRessyaBangouPasteIdouryou`/`m_iGouPasteIdouryou`)を累積加算 → パターンダイヤ連続入力 |
| 時刻のみ貼り付け | `OnEditPasteEkiJikoku_Process` | クリップボード列車の運行なし以外の駅時刻をフォーカス列車に上書き。列車番号等は不変(直通化の手動方式) |
| 作業のコピー / 列車情報のコピー | `OnEditOperationCopy/RessyaJouhouCopy_Process` | 運用作業・列車情報のみのコピー(OuDiaSecond 拡張) |
| すべて選択 | `OnEditSelectAll_Process` | 全列車選択 |
| 列車のプロパティ / 列車を挿入 | `execCDlgRessyaProp` | ダイアログ編集(新規位置なら末尾追加) |
| 駅時刻のプロパティ | `execCDlgEkijikokuProp` | §5参照 |
| 並べ替え | `OnJikokuhyouSort_Process` | フォーカス行で方式が決まる: 駅時刻行→駅扱ソート(停車→通過→経由なし→運行なし、指定なしは左、時刻順)/乗継ソート(ビューのプロパティで選択; `EEkijikokuSort_Ekiatsukai/Transfer`)。列車番号/種別/列車名/号数行→種別・列車名・号数・列車番号の辞書順。備考行→備考辞書順。選択中なら選択列車のみ。ソータは `entDed/CDedRessyaSoater_*` |
| 列車番号で一本化 | `OnJikokuhyouUnify_Process` | 全列車を列車番号で直通化(全自動方式) |
| 最小所要時間列車に移動 | `OnJikokuhyouEKikanSaisyouSec_Process` | フォーカス駅と次駅間の駅間最小所要秒数の列車を検索しフォーカス移動(入力ミス発見用) |
| 駅時刻を挿入/削除 | `OnJikokuhyouEkijikokuInsert/Erase_Process` | フォーカス位置に空欄を挿入し以下の駅時刻を1駅ずつ下/上へシフト(1駅飛ばし入力ミスの修正) |
| 駅時刻変更 / 再実行 | `OnJikokuhyouModifyEkijikokuCmd(Repeat)_Process` | ダイアログで指定した変更内容(`CentDedRessya_EkijikokuModifyOperation2` に保持: 駅扱変更/繰下げn分/他駅からのコピー+n分/設定なし化)をフォーカス位置に適用。再実行('.'キー)で同内容を別セルに連続適用 |
| 連続1分修正 | `OnJikokuhyouEkijikokuDec/Inc(NoMove)_Process` 等 | §5.4参照。フォーカス駅**以後**を±1分(Rev系は以前)。任意秒1/2はビュー設定の秒数 |
| 基準運転時分系 | `OnJikokuhyouEkijikokuAdjustStdOpeTime_Process` 等 | 基準運転時分(種別ごとの標準駅間所要)に当該駅時刻を合わせる(OuDiaSecond 拡張) |
| 直通化/分断/当駅始発/当駅止り/通過/通過-停車/経由なし/時刻消去/運休 | §5.5参照 | |
| 左へ/右へ | `OnJikokuhyouLeft/Right_Process` | 隣接列車と並び順入替(`CRfEditCmd_RessyaSwap`) |
| 運用系(出区/前列車/後列車/入区列車に移動、運用表を開く、運用番号検索) | `OnJikokuhyouMoveTo*_Process` 等 | 運用機能有効時のナビゲーション |
| 駅時刻表を開く / 駅のプロパティ / 交差支障チェック | `OnJikokuhyouOpen*_Process` | フォーカス駅に対応する別ビュー起動 |
| ダイヤグラムへ移動 | `OnJikokuhyouDiagramHeIdou_Process` | フォーカスの駅・列車が見える位置でダイヤグラムビューを開く |
| 時刻表CSV エクスポート/インポート | `OnFileExportJikokuhyoucsv_Process` | 表示設定込みの CSV 入出力 |

### 6.3 フォーカス移動モード

`m_bJikokuhyouFocusMoveRight`(`CWjkState_Ressyahensyu.h` 行129; [時刻表]→[フォーカス下移動]/[フォーカス右移動]で切替、ツールバーボタンあり)。ダイアログ確定や編集コマンド後の `moveFocusCellToNext(bJikokuhyouFocusToRight, bNextEkiOrder)`(`CWndJikokuhyou.cpp` 行1787-)が参照する:

- 下移動モード: 同列車の次の駅時刻行へ。発着表示駅の着時刻上では bNextEkiOrder=false なら同駅の発時刻へ。
- 右移動モード: 同行の次列車へ。

範囲選択は Shift+←/→ またはマウスドラッグ(列単位)。非連続選択も可(`CaMuiSelect` に選択・非選択が混在し得る、`CRfEditCmd_Ressya.h` コメント)。

---

## 7. 表示書式

### 7.1 記号(文字列リソース、`DiagramEdit.rc` 行3366-3373)

| リソース | 文字列 | 意味 |
|---|---|---|
| `IDS_WORD_JIKOKUHYOU_TSUUKA` | `" ﾚ"` | 通過(時刻非表示時) |
| `IDS_WORD_JIKOKUHYOU_KEIYUNASI` | `"||"` | 経由なし |
| `IDS_WORD_JIKOKUHYOU_UNKOUNASI_IPPAN` | `"・・"` | 運行なし(一般表記) |
| `IDS_WORD_JIKOKUHYOU_UNKOUNASI_SYUYOU` | `"----"` | 運行なし(主要駅表記; `bIsSyuyouEkiHyouki`、発着表示駅は除く) |
| `IDS_WORD_JIKOKUHYOU_TEISYA` | `"○"` | 停車(時刻なし停車) |
| `IDS_WORD_JIKOKUHYOU_SYUUCHAKU` | `"===="` | 終着後の表記 |
| `IDS_WORD_JIKOKUHYOU_CONNECT`/`RELEASE` | `"↳"`/`"↴"` | 増結/解結(運用) |

### 7.2 時刻表示 — `CCellBuilder::getCdDedJikokuConv()` (`CCellBuilder.cpp` 行185-220)

`CdDedJikoku::CConv(コロン=!m_bDisplayColonEkiJikoku, EHour_ZeroToSpace, 秒=m_bDisplaySecondEkiJikoku ? Output : NoSecond, 着秒丸め, 発秒丸め, m_bDisplay2400)`。つまり既定は「コロンなし・時の先頭ゼロはスペース・秒なし」(例 `" 955"`, `"1023"`)。秒表示 ON で秒付き。着/発で秒の丸め方(切捨て/四捨五入/切上げ, `ESecondRound`)を別指定可能。24時超え表記(`bDisplay2400`)対応。

### 7.3 色・フォント

- 種別ごとの文字色: `CentDedRessyasyubetsu::getJikokuhyouMojiColor()` を種別行・列車番号行・時刻セル等に適用(`createCDcdRessyabangou`、`CCellBuilder.cpp` 行330-)。
- 種別ごとのフォント: `getJikokuhyouFontIndex()` → `CdDedDispProp::getJikokuhyouFont(idx)`(太字/斜体等はフォント定義側)。停車時刻セルに適用。通過時刻セルへは `m_bDisplayTsuukaFontPerSyubetsu` ON のときのみ適用。
- 通過時刻(表示時)・通過記号は灰色 `CdColorProp(128,128,128)`(`getCdDrawTextPropTsuuka`、行131)。
- 通過駅の時刻表示: `m_bDisplayTsuukaEkiJikoku`(既定 true)。OFF なら時刻の代わりに `"ﾚ"`。時刻未入力の通過も `"ﾚ"`。
- 運休列車(`isCanceled()`): セル背景を灰色 `CdBrushProp(128,128,128)`(行5878-)。運用番号も非表示。
- 親種別表示 `m_bDisplayParentSyubetsu`: ON なら子種別を親種別の色・フォント・略称で表示。
- 列車名・備考は縦書きテキスト(`CDcdTextboxV3`, `getJikokuhyouVFont()`)。
- 駅名列はシステムメニュー色背景(見出し)。セル幅は `CdDedDispProp::m_iJikokuhyouRessyaWidth`(文字数)基準。
- 番線行は駅の番線略称(`CentDedEkiTrack2Cont`)を表示。

### 7.4 表示トグル(すべて `CWndJikokuhyou` の属性、[表示]メニュー、.ini に保存)

`m_bDisplayTsuukaEkiJikoku`(通過駅の駅時刻を表示; 既定true) / `m_bDisplayAllEkiJikoku`(全時刻を表示; 駅時刻形式を無視して全駅の着発を表示) / `m_bDisplaySecondEkiJikoku`(秒表示) / `m_bDisplayColonEkiJikoku`(コロン付き) / `m_bDisplayShihatsuShuchakuEkimei`(始発・終着駅名欄) / `m_bDisplayParentSyubetsu`(親種別表示) / `m_bDisplayTsuukaFontPerSyubetsu`(通過に種別フォント) / `m_bStandardOperationTimeFunction`(基準運転時分機能; ステータスバーに基準比を表示) / `m_bOperationUpdateStop`(運用更新の一時抑止) / `m_bModifyEkijikoku`(繰上げ繰下げの有効) / `m_eEkijikokuSort`(駅扱ソート/乗継ソート) / `m_bCompareBottom`(並べ替えの末尾要素基準)。初回 OnUpdate で .ini から読込(`m_bReadCWndJikokuhyouDefault`)。

### 7.5 更新の最適化

`OnUpdate(pHint)` は編集コマンド(`CRfEditCmdHolder`)の型で差分更新を選択: `CRfEditCmd_Ressya` → `updateUI_ReplaceRessya(iDstRessyaIndex, iDelCount, iInsertCount)`(該当列のみ再構築)、`CRfEditCmd_Operation` → 運用番号のみ更新、コメント/ダイヤ変更 → 無視、駅・種別・路線変更 → 全更新 `updateUIAll()`。非アクティブビューでは全更新を保留し(`m_bUpdate_All_Requested`)、アクティブ化時に実行する。

---

## 8. カスタマイズ時刻表モード

`CJikokuhyouDoc::m_bCustomizeDisplayMode = true` の別ビュー(冊子時刻表風の表示・印刷用途)。相違点:

- 列車列は `CentDedDia` の `vector<CustomizeJikokuhyouContent>`(`entDed/CentDedDia.h` 行394-)で定義。1列に**複数列車のチェーン**(`iRessyaIndexCont`)を連ねて直通表示でき、路線外始発/終着・種別変更・増解結・パターンダイヤプレビュー(`iShiftSecond`)を表現する。
- 行構成は駅ごとの表示設定(`CentDedEki::getJikokuhyouPrev*Display()`/`getJikokuhyouOuter*Display()`/`getJikokuhyou(Chaku|Hatsu|Nyuusen)JikokuDisplay()` 等)に従い、前列車情報行・駅別種別変更行・入線時刻行等が追加される(§3.3)。
- セル構築は `CCellBuilderCustomize`。編集コマンドの多く(通過・±1分等)は `getCustomizeDisplayMode()` で無効化される(表示専用に近い)。

---

## 9. 駅時刻表ビュー(ViewEkiJikokuhyou)

### 9.1 グリッド構成

- Y列(行): `ColumnType_Head`(ヘッダ行)+ 時(hour)ごとに `ColumnType_RessyaSyubetsu`(種別)/`ColumnType_Minute`(分)/`ColumnType_Destination`(行き先)/`ColumnType_RessyaTrack`(番線; `m_bDisplayTrack` 時のみ) の3〜4行(`CdEkiJikokuhyouYColSpecCont::scan`)。時の範囲は `m_iFirstHour` から `m_iHourCount` 時間分で、24時を跨ぐと 0時に折り返す(iOffset=-24)。開始時は路線の基点時刻(`getKitenJikoku()`)を考慮して算出。
- X列: `ColumnType_Hour`(時表示; 1時間ぶんの行グループに縦方向セル結合 `setAttachCellCount(1, 3or4)`)+ `ColumnType_Ressya`(その時間の n 番目の列車)×最大本数 `m_iMaxRessyaCount`。

### 9.2 生成規則 — `CWndDcdGridEkiJikokuhyou::OnUpdate_All()` (`CWndDcdGridEkiJikokuhyou.cpp` 行850-)

対象方向の全列車を走査し、以下を**除外**: 運休(`isCanceled()`)・非表示種別(`getHidden()`; `getDisableHiddenSyubetsu()` で無効化可)・当駅の駅扱が停車以外・発時刻 Null・次駅へ運行しない列車(`isRunBetweenNextEki()`=false、つまり当駅止まり)。採用列車ごとに `EkiJikokuhyouContent` を作り、`getVirtualHatsujikoku()` を `ESecondRound`(`m_iSecondRound`)で丸めて時→バケツ(`m_contListEkiJikokuhyouContent: map<hour, list>`)へ、分昇順で挿入ソート。

- 行き先: 有効終着駅(`getValidSyuuchakuEki()`)の時刻表略称 `getEkimeiJikokuhyouRyaku(true)`。路線外終着なら `getOuterTerminalJikokuRyaku()`。環状運転は `iSyuuchakuEkiOrder=-1`(「環状」)、行き先環状線は -2。
- 当駅始発マーク: `bIsShihatsu`(有効始発駅=当駅、かつ路線外始発でない)。`m_bDisplayIsShihatsu` ON で分の前に `"●"` を付加(行479-486)。
- 種別変更(運用機能): 次列車接続で種別が変わる場合、`iMinute=-1` の擬似エントリで「種別変更」を表示(`m_bDisplayClassChange`)。
- 各セルの色/フォントは種別の `getJikokuhyouMojiColor()`/`getJikokuhyouFont(idx)`。親種別表示 `m_bDisplayParentSyubetsu` あり。
- パターンダイヤプレビュー(`getPatternDiagramPreviewEnable()`): 周期秒 × 範囲でエントリを複製シフト。
- 分岐・環状線の駅は `getEkiIndexBrunchLoop`/`iEkiOrderTable` で同一駅に集約して扱う。

### 9.3 操作・オプション

編集機能はない(時刻の編集不可)。コマンド(`CWndDcdGridEkiJikokuhyou.cpp` メッセージマップ行3026-):

- `ID_EkiJikokuhyou_MoveToJikokuhyou` 時刻表へ移動(選択列車のセルへフォーカス) / `ID_EkiJikokuhyou_MoveToDiagram` ダイヤグラムへ移動。ダブルクリック・OnKeyDown からも遷移【推測: ダブルクリックは時刻表移動に対応。OnLButtonDblClk が存在】。
- 表示トグル: 番線表示(`m_bDisplayTrack`)・当駅始発●表示(`m_bDisplayIsShihatsu`)・種別変更表示(`m_bDisplayClassChange`)・親種別表示。秒の丸め方式 `m_iSecondRound`。
- CSV エクスポート(`CconvEkiJikokuhyouCsv`)。

### 9.4 駅時刻表一覧ビュー(`CWndDcdGridEkiJikokuhyouList`)

行=駅、列=[駅名 / 下り / 上り] の表(`CWndDcdGridEkiJikokuhyouList.cpp` 行560-)。下り/上りセルにはダイヤ別名(`getKudariDiaAlias()` 等、無ければ「下り」「上り」)を表示。駅時刻形式が下り着時刻のみ/上り着時刻のみの駅は該当方向セルを空にする。ここから対象駅×方向の駅時刻表ビューを開く。

---

## 10. Web 再実装に向けた論点

### 10.1 難所

1. **CCellBuilder(+Customize) 合計2.4万行のセル書式ロジック**。ただし大半は「(行種別 × 駅扱 × 駅時刻形式 × 運用モード) → テキスト/色/フォント/罫線」の場合分けの列挙であり、宣言的なセルレンダラ(spec → cell view-model)として再設計すれば大幅に圧縮できる。着/発/番線/作業行それぞれの運行なし・経由なし・終着後の表記規則(§7.1)を正確に移植することが肝要。
2. **状態機械+キー転送**: 「文字キー押下でダイアログを開き、そのキーをダイアログ入力欄へ転送する」挙動(`CKeyinputSenderToModalDlg`)は Windows メッセージ依存。Web ではモーダル/インラインエディタを開いて初期文字列として渡せば等価になる。
3. **駅Order の方向依存**(上りは駅リスト逆順)と分岐・環状線の駅集約(`getEkiOrderBrunchLoop`)。編集時の分岐駅整合調整(連続入力・通過コマンド内の `AdjustBrunchLoop`)はドメイン層の移植が前提。
4. **差分更新**: 列車1本の編集で全再描画しない設計(`updateUI_ReplaceRessya`)。Web では仮想スクロール+列単位の再レンダリングで対応(列車数千本×駅数百行のグリッドを想定)。
5. **カスタマイズ時刻表**(`CustomizeJikokuhyouContent`)は列=列車チェーンで別物のレイアウトエンジン。初期リリースでは対象外にする判断も可能(基本の編集モードと独立)。

### 10.2 Windows 依存で置換すべきもの

- クリップボード(列車の独自形式) → アプリ内クリップボード+`navigator.clipboard`(テキスト形式は CSV 互換で)。
- .ini による表示設定永続化 → localStorage 等。
- アクセラレータテーブル → keydown ハンドラ(§5.4 の表をそのまま移植可能)。
- MFC Doc/View の OnUpdate ヒント → ストア購読+コマンド型による差分更新。
- ステータスバー表示(貼り付け移動量/連続入力モード/基準運転時分比)。

### 10.3 そのまま移植すべきコア仕様(振る舞い互換の要)

- `CdDedJikoku::decode` の時刻解釈(§5.1)と2桁分入力の時補完(±1時間補正付き、§5.2)。
- 繰上げ・繰下げ(`modifyCentDedEkiJikoku` = 以後の駅へ伝播)と Rev 系(以前の駅へ)。
- 貼り付け移動量の**累積**加算セマンティクス(コピー時リセット)。
- 連続入力モードのキー仕様(0-5 → 0-9、BackSpace 2段階、Esc、終着で自動終了)。
- `CRfEditCmd_Ressya` による「範囲置換」型 Undo モデル。全列車編集をこの1コマンドに正規化している点は Web でもそのまま採用でき、Undo/Redo 実装が単純になる。
- Y行スペック(`CdYColSpec`)/X列スペック(`CdXColSpec`)による「グリッド座標 ↔ 意味」の双方向マッピング(非表示時の代替解決含む)。フォーカス維持・スクロール位置維持の要。

### 10.4 単純化できる点

- 状態2つの StateMachine は、React 等では「編集モード enum + 連続入力用ローカル状態」で足りる。
- `bQueryEnable` 二相呼び出し(メニュー Enable 判定)は、コマンドごとの `canExecute()` 導出値で代替。
- 印刷対応(CJikokuhyouView の OnPrint 系)はブラウザ印刷 CSS で代替。
- 運用機能(作業行・運用番号行・作業プロパティ)は行生成・±1分コマンドの多態など随所に食い込んでいるが、フラグ `iEnableOperation`(0=無効/1=簡易/2=通常)で完全に分離されているため、フェーズ分割(まず iEnableOperation=0 相当)が可能。
