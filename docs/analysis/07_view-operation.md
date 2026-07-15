# 運用機能・交差支障チェック分析(OperationTable / AllOperationTable / AllOperationTable2 / CrossingCheck)

対象バージョン: OuDiaSecond ver 2.06.23。
本書は「車両運用(駅作業・運用番号・運用探索)」と「交差支障チェック」に関わるデータモデル・アルゴリズム・ビューを分析したものである。

**出典に関する注記**: `origin/DiagramEdit/manual/oudia_manual/` 配下のHTMLマニュアルは本家 OuDia (take-okm, 2006-2017) のものであり、運用機能・交差支障チェックの記載は無い。これらは OuDiaSecond (diagram_mania) の独自機能であり、仕様は `origin/DiagramEdit/manual/OuDiaSecond説明.txt`(UTF-8 BOM付き) に記載されている。`origin/OuDiaSecond変更箇所.txt` の変更履歴でも、これらのファイル群が作者による追加・変更箇所として列挙されている(例: Ver2.06.23 で ViewOperationTable、Ver2.06.20 で ViewCrossingCheck、Ver2.06.19 で ViewAllOperationTable2 など)。

**ソース文字コードの注記**: entDed 内でも運用機能関連の新しいファイル(`CentDedBeforeOperation.h`、`CentDedAfterOperation.h`、`CDedOperationConnecter.cpp` 等)は UTF-8(BOM付き)、古くからのファイル(`CDedOperationConnecter.h`、`CentDedEki.h` 等)は CP932 と、混在している。

---

## 1. 「運用」の概念モデル

### 1.1 全体像

- OuDiaSecond の運用機能は **「運用番号」フィールドを列車に直接持たせる方式ではない**。各列車の始発駅・終着駅・中間駅の駅時刻(`CentDedEkiJikoku`)に**駅作業(前作業/後作業)**を持たせ、「出区」「入区」「前列車接続」「次列車接続」などの作業を**運用探索(CDedOperationConnecter)が時刻・番線の一致によって自動的に連結**し、出区作業に入力された運用番号を後続列車に伝播させる、というチェーン構築方式である。
- 運用機能の有効/無効は路線単位の設定 `CentDedRosen::m_iEnableOperation`(`origin/DiagramEdit/DiagramEdit/entDed/CentDedRosen.h`)で持つ。
  - `0`: 無効 / `1`: 簡易モード(列車の接続のみ行い運用番号は割り当てない) / `2`: 通常モード(運用番号割り当てまで行う)。規定値 0。
- 路線単位の関連設定(同ファイル):
  - `m_bOperationNumberReverse`: 下り⇔上り折り返し時に運用番号列を反転する(例 `"01A","21B"` → `"21B","01A"`)。
  - `m_bOperationCrossKitenJikoku`: ダイヤグラム起点時刻を跨いで運用を接続するか(規定値 true)。

### 1.2 駅作業エンティティ

#### 保持場所

`CentDedEkiJikoku`(列車の1駅分の時刻。`origin/DiagramEdit/DiagramEdit/entDed/CentDedEkiJikoku.h`)が以下を包含する:

- `CXBeforeOperationCont m_CentDedBeforeOperationCont` — この駅における**前作業**(列車発車前の作業列)。時系列順。
- `CXAfterOperationCont m_CentDedAfterOperationCont` — この駅における**後作業**(列車到着後の作業列)。時系列順。

コンテナは `CentDedBeforeOperationCont` / `CentDedAfterOperationCont`(同ディレクトリ)で、内包側から外側オブジェクトへ `offsetof` による逆算でアクセスする MFC 流のハックがある(`getBeforeOperation()` 等)。

#### CentDedBeforeOperation(前作業)

`origin/DiagramEdit/DiagramEdit/entDed/CentDedBeforeOperation.h`。作業種類は `enum class EBOperation`:

| 列挙値 | 意味 | 備考 |
|---|---|---|
| `BOperation_Shunt` | 入換(規定値) | 番線間の移動。前作業では「設定番線 → 発着番線側」への移動 |
| `BOperation_Connect` | 増結 | 増結相手編成の**前作業コンテナを入れ子で保持** |
| `BOperation_Release` | 解結 | 解結編成の**後作業コンテナを入れ子で保持** |
| `BOperation_Out` | 出区 | 開始作業。運用番号の入力起点 |
| `BOperation_Outer` | 路線外始発 | 開始作業。路線外発着駅 Index と時刻を持つ |
| `BOperation_Junction` | 前列車接続 | 開始作業。出区・路線外以外はすべてこれ |
| `BOperation_NumberChange` | 運用番号変更 | 編成そのまま運番のみ変更。反転も可(Ver2.06.05〜) |

フィールドは**作業種類ごとに意味が変わる汎用スロット**である(C++ 上は 1 クラスに全種類を詰めた「非タグ付き共用体」的設計):

- `bool m_bBoolData1, m_bBoolData2`
- `int m_iIntData1, m_iIntData2, m_iIntData3`
- `CdDedJikoku m_JikokuData1, m_JikokuData2, m_JikokuData3`
- `vector<tstring> m_strOperationNumber1, m_strOperationNumber2, m_strOperationNumber3`
- `tstring m_strInOutLinkCode`
- `CXBeforeOperationCont m_CentDedBeforeOperationCont`(増結編成の前作業)
- `CXAfterOperationCont m_CentDedAfterOperationCont`(解結編成の後作業)

主な対応(ヘッダのコメントより。※印は運用探索が書き込む導出値):

- 入換: IntData1=入換前番線、Jikoku1=入換発時刻、Jikoku2=入換着時刻(NULLなら発と同時)、Bool1=入換着時刻を当駅着時刻として表示するか。
- 増結: Bool1=増結編成を運番上で前に付けるか、Jikoku1=増結時刻(NULL可、既定は着時刻等)、※Number1=増結後運番、※Number2=増結前主編成運番、※Number3=増結前増結編成運番、※Bool2=増結編成運番割り当て済みフラグ。
- 解結: IntData1=解結位置(0:後方/1:前方/2:前方数指定の残り)、IntData2=編成数、Jikoku1=解結時刻、※Number1=解結前運番 → `splitOperationNumber()` で Number2(主編成)/Number3(解結編成) に分割。
- 出区: Jikoku1=出区時刻、Number1=手入力の運用番号(複数編成はセミコロン区切り→配列)、`m_strInOutLinkCode`=入出区連携コード、※Number2=連携コードで引き継いだ割り当て運番、※Bool1=割り当て運番が有効か。
- 路線外始発: IntData1=路線外発着駅Index、Jikoku1=路線外始発駅発時刻、Jikoku2=当駅着時刻(V2で駅時刻から作業側へ移動)、Number1=運用番号、連携コードあり。
- 前列車接続: Jikoku1=起点時刻(接続探索の基準。競合回避に使用)、Number1=仮運用番号、※Number2=割り当て運番、※Bool1=種別変更で繋がっているか、※Bool2=列車情報表示省略、※Jikoku2/3=前列車接続時刻(在線表有り/無し駅)、※IntData1/2=前列車方向(在線表有り/無し駅)、※IntData3=前列車終着駅Order。
- 運用番号変更: Number1=新運用番号(空可=Ver2.06.05〜)、Bool1=運用番号順反転、※Number2=旧運番、※Number3=反転後運番。

共通操作: `modifyOperationJikoku(iSecond)`(時刻シフト)、`clearOperationNumber()`(探索割り当て分の初期化)、`trimSuffixOperationNumber()`(探索時に付与される接尾辞「;数字」の除去)、`adjustOperation()`(開始作業は先頭のみ等の正規化)、`adjustEkiTrack2()` / `adjustOuterTerminal()`(番線・路線外駅の Index 変更追随)、`fixOperation()`(貼り付け時の範囲補正)。

#### CentDedAfterOperation(後作業)

`origin/DiagramEdit/DiagramEdit/entDed/CentDedAfterOperation.h`。`enum class EAOperation` は前作業の鏡像:
`AOperation_Shunt` / `AOperation_Connect` / `AOperation_Release` / `AOperation_In`(入区) / `AOperation_Outer`(路線外終着) / `AOperation_Junction`(次列車接続) / `AOperation_NumberChange`。

特記事項:

- 次列車接続の `m_iIntData1` = **次列車接続タイプ**: `0`:別列車 / `1`:種別変更 / `2`:列車情報変更 / `3`:同一列車扱い。前後の列車を営業上一続きとして表示するかを制御する中核パラメータ。
- ※`m_bBoolData1`(次列車接続)=後列車接続成功フラグ。在線表の横線描画の委任判定に使う。
- ※`m_iIntData2`、※`m_JikokuData2` は接続相手(前列車接続)へ書き込む前の仮置き値。
- 入区・路線外終着にも `m_strInOutLinkCode` あり。

#### 作業設定可能条件(仕様)

`OuDiaSecond説明.txt`「＜駅作業の設定条件と駅時刻形式＞」: (1)有効始発駅 (2)有効終着駅(着時刻必須) (3)中間駅(着発とも時刻必須、前後駅が停車/通過) (4)中間駅(分岐型: 分岐/環状で同一駅扱いの駅Aに前作業・駅Bに後作業を割り当て、ダイアログではまとめて編集)。`CentDedRessya::getValidSihatsuEki()` / `getValidSyuuchakuEki()` が有効始発/終着駅を返す。

### 1.3 運用探索の成果物(CentDedDia 側)

`origin/DiagramEdit/DiagramEdit/entDed/CentDedDia.h`:

- `enum class EBeforeAfterType`: `Unrelated`(0) / `ClassChange`(1) / `PropertyChange`(2) / `PropertySame`(3) / `OutIn`(4) / `Outer`(5) / `OperationNumberChange`(6)。0-3 は次列車接続タイプに対応。
- `struct OperationTableContent`: **1列車内での1運用番号の「開始作業〜終了作業」区間**を表す運用表の材料。フィールド: `CdDedRessyaProperty aRessyaProperty`(方向+列車Index+時刻)、`iSihatsuEkiOrder` / `eBeforeType` / `iOuterShihatsuekiIndex` / `OuterShihatsuJikoku` / `ChakuJikoku`、`iSyuuchakuEkiOrder` / `eAfterType` / `iOuterShuchakuekiIndex` / `HatsuJikoku` / `OuterShuchakuJikoku`、`const CentDedAfterOperation* AfterOperation`(並び順確定用の検索キー)。
- `unordered_map<tstring, list<OperationTableContent>> m_contOperationTableContent` — **運用番号 → その運用に属する列車区間リスト**。運用表・運用一覧表・運用一覧図のすべてのデータ源。
- `struct InOutLinkCodeContent`(入出区連携コード → 状態と出区作業ポインタ・運番)。`iStatus`: 0=出区(路線外始発)のみ / 1=入区(路線外終着)のみ / 2=ペア成立(有効) / 3=無効。3 は「出区・入区の片方または両方が2本以上存在(重複)」に加え、「ペアは成立しているが起点時刻を跨いでいる場合(`m_bOperationCrossKitenJikoku`=false、すなわち起点時刻跨ぎ接続が無効のとき)」も含む(`origin/DiagramEdit/DiagramEdit/entDed/CentDedDia.h` の `InOutLinkCodeContent` コメント)。
- `struct CustomizeJikokuhyouContent`: カスタマイズ時刻表の1列を構成(複数列車の同列併合、`strOperationNumber` / `strPrevOperationNumber`、増解結矢印表示等)。運用探索が組み立てる。
- パターンダイヤプレビュー設定: `m_bPatternDiagramPreviewEnable` / `m_iPatternDiagramPreviewCycleSecond`(60〜10800秒) / `m_iPatternDiagramPreviewRange`。
- `CdDedRessyaProperty`(`entDed/CdDedRessyaProperty.h`) = `{ERessyahoukou m_eRessyahoukou, int m_iRessyaIndex, CdDedJikoku m_aCdDedJikoku}`。運用系処理全体で「列車の一点」を指すハンドル。

---

## 2. 運用探索アルゴリズム(CDedOperationConnecter)

`origin/DiagramEdit/DiagramEdit/entDed/CDedOperationConnecter.h` / `.cpp`(cpp は10,247行)。

### 2.1 起動タイミング

`CentDedRosen::OperationConnect(int iDiaIndex)`(`entDed/CentDedRosen.cpp` 2415行)が唯一の入口。`EnableOperation > 0` なら `CDedOperationConnecter` を生成し、**コンストラクタ内で探索を実行**する:

- パターンダイヤプレビュー有効 → `operationConnectPatternDiagram()`
- `EnableOperation == 2`(通常) → `operationConnect()`
- それ以外(簡易) → `operationConnectLight()`

呼び出し元は時刻表編集(`ViewJikokuhyou/WndJikokuhyou/CWjkState_*`)、ファイル読み込み(`CconvCentDed*`)、駅時刻表ビュー等。つまり**列車編集のたびにダイヤ単位で全再探索**する。UI には「運用更新を一時停止する」(下り/上り・ダイヤ別)と手動更新(F5)がある(説明.txt)。

### 2.2 主要内部構造

- `vector<vector<list<RessyaElement>>> m_contRessyaExist` — `[駅Index][番線Index]` ごとに、**次列車接続(後作業)/前列車接続(前作業)を時刻順に並べたリスト**。接続探索の索引。`RessyaElement = {BeforeOperation*, AfterOperation*, CdDedRessyaProperty, iShiftSecond}`。
- `vector<RessyaElement> m_contOutOuter` — 出区・路線外始発作業の一覧(探索の起点)。
- `vector<RessyaElement> m_contNumberChange` — 運用番号変更作業の一覧(第二の起点)。
- `vector<RessyaElement> m_contJunctionList` — 前列車が見つからない前列車接続の強制起点/簡易モードの次列車接続。
- `vector<RessyaElement> m_contConnectWaitList` — 増結編成側運番が未確定の増結作業の待機リスト。
- `vector<vector<vector<OperationElement>>> m_contRessyaOperationElement` — `[方向][列車Index]` ごとの「作業簡略図」。`OperationElement = {BeforeOperation*/AfterOperation*, vector<int> iLevel, iEkiIndexofContExist, iRessyaTrackIndex, iEkiOrder}`。**`iLevel` は増結前・解結後コンテナの入れ子を桁で表す階層パス**(例: 親作業のiLevelに一桁足す)で、これを辿ることで再帰構造をフラットに探索する。
- `m_contOperationTableContentBuffer` — `[方向][列車Index]` の `運番→OperationTableContent` 一時バッファ(開始側を貯め、終了側で取り出して `CentDedDia::m_contOperationTableContent` へ)。
- 隠し種別(`m_contHidden`)は探索から見た目上除外され、隠し-非隠し間の接続タイプは「別列車」扱い。

### 2.3 通常モード `operationConnect()` の流れ(cpp 3901行〜、コメントの Step 記述より)

1. **Step1(全列車、OpenMP並列)**: 有効始発駅の前作業〜有効終着駅の後作業を順に読み、`searchBeforeOperationElement` / `searchAfterOperationElement`(増結前/解結後コンテナを再帰的に展開)で `OperationElement` 列を作る。開始作業・終了作業・増解結・運番変更を抽出し、出区/路線外始発 → `m_contOutOuter`、運番変更 → `m_contNumberChange`、前列車接続 → `m_contJunctionList` へ。次列車接続・前列車接続は駅×番線の `m_contRessyaExist` に時刻順挿入。入出区連携コードが入力された作業は `contInOutLinkCodeContent` に登録しペア成立を判定。過去に書き込まれた割り当て運番はクリア。運休列車・有効始終着なし列車は除外。
2. **Step2(起点単位で OpenMP並列、`schedule(guided)`)**: `m_contOutOuter` の各出区作業から `junctionOperationElement()` で連結を開始。運番を作業に書き込みながら `iLevel` 順に次作業へ進み、次列車接続に達したら `SearchRessyaElement()` で同駅同番線・終点時刻以降で最初の前列車接続を見つけて接続し、相手列車の探索を続行する(折り返し時に `m_bOperationNumberReverse` なら運番列反転)。開始時に `insertOperationTableContentToBuffer`、終了作業で `addOperationTableContent`。入出区連携が成立(iStatus==2)している出区はここではスキップ(入区側から引き継ぐ)。
3. **Step3(起点単位で OpenMP並列、`schedule(guided)`)**: `m_contNumberChange` から接続開始(旧運番→新運番/反転)。Step2・Step3 の連結処理は `#pragma omp critical(Operation)` 等のクリティカルセクションで共有状態(作業への運番書き込み等)を保護しながら並列実行される。
4. **前列車の無い前列車接続**: `SearchRessyaElementRev()` で前列車不在を確認し、仮運用番号(なければ空白運番)で強制的に接続開始。
5. **ConnectWaitList ループ**: 増結作業で増結編成側運番が未割り当てのものを待機させ、割り当てが進むたびに再試行。1周で変化がなければ打ち切り。
6. **後処理**: 運番接尾辞「;n」の除去(`trimSuffixOperationNumber`。同一運番の複数回出区を区別するため探索中に付与)、`completeCustomizeJikokuhyouContent()`(カスタマイズ時刻表の併合・分割・路線外相当表示の組み立て)。

`operationConnectLight()`(586行〜)は運番割り当てを行わず、次列車接続と前列車接続の組を繋いで種別変更・増解結の表示情報(CustomizeJikokuhyouContent、種別変更フラグ等)のみ構築する。`operationConnectPatternDiagram()`(2165行〜)は列車を `iShiftSecond`(サイクル秒の倍数)でコピーしたものとして扱い接続する。

### 2.4 入出区連携コード

入区(または路線外終着)と出区(または路線外始発)に同一コードを設定すると、コードのペアが 1:1 で成立した場合に限り、入区側の割り当て運番が出区側へ自動で引き継がれる(`m_strInOutLinkCode`、`InOutLinkCodeContent.iStatus==2`)。一覧表示専用ビュー `ViewInOutLinkCodeList/`(CWndDcdGridInOutLinkCodeList 等)がある。

---

## 3. 運用系3ビュー

いずれも MDI 子ドキュメント(`CHidemdiSubDoc` 派生)+ビュー+実描画ウィンドウの3層。Doc はビューの識別子(ダイヤ名等)のみ保持する薄いクラス。

### 3.1 運用表(ViewOperationTable) — 1運用番号の詳細

- `COperationTableDoc`(`origin/DiagramEdit/DiagramEdit/ViewOperationTable/COperationTableDoc.h`): `m_strDiaName` + `m_strOperationNumber` を保持。**「ダイヤ×運用番号」ごとに開くビュー**。
- 実体は `CWndDcdGridOperationTable`(6,225行)。データは `CentDedDia::getcontOperationTableContent().at(運用番号)` から取得。
- **従来形式**: 1列車=1行。列構成は `OperationTableColSpec/CdOperationTableXColSpec.h` の `EColumnType`: `Ressyabangou`(列車番号) / `Ressyasyubetsu`(種別) / `Ressyamei`(列車名) / `OriginSideEkimei`・`OriginSideEkiTrack`・`OriginSideEkijikoku`(始発側の駅名・番線・時刻) / `Ressyahoukou`(方向矢印) / `TerminalSideEkimei`・`TerminalSideEkiTrack`・`TerminalSideEkijikoku`(終着側) / `JikokuDisplayEki`・`RessyahoukouExtension`(箱ダイヤ用)。番線列は Ver2.06.23 追加。同一列車扱いで接続された2列車は1行に併合。
- **箱ダイヤ形式**(`m_bDisplayExtensionOperationTable`): 表示駅を「(1)駅設定の`箱ダイヤ時この駅の時刻を表示`(oud2キー `OperationTableDisplayJikoku`) (2)運用中列車の始発終着駅 (3)路線外発着用の外側スペース」で決定し、列車を水平線+着/発時刻で描画、直接接続は縦線で連結、出区○/入区△印、経由なし区間は破線(説明.txt ＜運用表(箱ダイヤ形式)＞)。
- 表示オプション: 秒表示・コロン表示・親種別・上り始発駅を左に・着発番線名表示・通過駅時刻表示(箱ダイヤ)・列車名号数表示(路線プロパティ準拠)。
- 操作: コピー(テキスト)、時刻表へ移動/移動して編集(キー入力転送あり)、ダイヤグラムへ移動、CSVエクスポート(`CconvOperationTableCsv`)。
- フォント・色は DispProp の `OperationTableFont` / `OperationStringColor` / `OperationGridColor`。

### 3.2 運用一覧表(ViewAllOperationTable) — 全運用のサマリグリッド

- `CAllOperationTableDoc`: `m_strDiaName` のみ。ダイヤごとに1つ。路線ツリーの「運用一覧」から開く(運用機能が通常モード時のみ表示)。
- `CWndDcdGridAllOperationTable`(4,055行)。行=運用番号、列(`AllOperationTableColSpec/CdAllOperationTableXColSpec.h`): `ColumnNumber` / `OperationNumber` / `OutEkimei`(出区駅) / `OutHatsujikoku`(出区時刻) / `Arrow` / `InEkimei`(入区駅) / `InChakujikoku`(入区時刻)、右側に列車情報の繰り返し(`Ressyahoukou` / `Ressyabangou` / `Ressyasyubetsu` / `Ressyamei` / `RessyaArrow`)。
- `m_bDisplayAllRessya`(表示メニュー「全列車を表示」): true で運用中の全列車を横並び、false で出区列車と入区列車のみ。
- 並び順は `EOperationSort`(`CWndDcdGridAllOperationTable.h`): `OperationNumber` / `OutEki` / `OutJikoku` / `InEki` / `InJikoku` の5種+「運用番号を末尾要素から比較する」フラグ(`CDlgAllOperationTableProp` で設定)。駅順ソートでは分岐駅は分岐元駅位置に集約、路線外発着は同駅内で後ろ、同着は時刻順→運番順。
- 操作: 運用表へ移動(Enter/ダブルクリック)、時刻表へ移動(F7)、ダイヤグラムへ移動(F8)、時刻表に移動して出区駅作業編集(F6, Ver2.06〜)。
- CSVエクスポート: `CconvAllOperationTableCsv` + `CDlgOperationTableCsvExport`。全運用/運番文字列マッチ(一致・含む・前方・後方)/出区駅・入区駅指定(路線外発着含むオプション)での抽出と、並び順・箱ダイヤ形式・各表示オプションを指定して出力。

### 3.3 運用一覧図(ViewAllOperationTable2) — グラフィカル運用ダイヤ

- 「2」は運用一覧表(グリッド)に対する**新規のグラフィック実装**(旧版の置き換えではなく別ビュー)。ウインドウ種別としても別物(oud2 の `WindowType`: 5=運用一覧表、6=運用一覧図)。
- 構成(`origin/DiagramEdit/DiagramEdit/ViewAllOperationTable2/`):
  - `CDcdAllOperationTable`: グラフ部分のみを IfDcdTarget(自前描画ライブラリ DcDrawLib の描画先抽象)へ描画。`CentDedDgrDia`(ダイヤグラム描画エンティティ)と関連。
  - `CDcdAllOperationTable2`: 上記を包含し、上部の「時」目盛・左右の運用情報部(運用番号、出区駅名・発時刻、入区駅名・着時刻)を加えて全面を描画。
  - `CWndAllOperationTable2`: 描画ウィンドウ。`setOperationNumber()` で表示対象を指定。
  - `CaDcdAllOperationTable2_PageSelector`: 印刷ページ分割アダプタ。
  - `CDedAllOperationTable2Doc/View`, `CDlgAllOperationTable2ViewProp`(プロパティ: 並び順=運用一覧表と同形式、横軸表示範囲)。
- 表示内容(説明.txt ＜運用一覧図＞): 行=運用、横軸=時刻。各列車を水平線分で描画(種別のダイヤグラム線色)、線上に列車番号・種別名・列車名(表示切替可)、線の左右上部に始発・終着時刻の分(`AllOperationTableJikokuFont`)。始発終着駅名は駅設定の「駅名略称(運用一覧図)」(oud2キー `EkimeiDiaRyaku`、空なら駅名頭文字、路線外はダイヤグラム略称)。種別変更等で接続された列車は線の終端を次列車の線に接して描画、同一列車扱いは1本に併合。横軸拡大縮小・目盛粗密変更、ダブルクリックで運用表または時刻表へ遷移。

### 3.4 時刻表・ダイヤグラム側への波及(参考)

- 時刻表ビュー: 2行目に運用番号欄(段数 `OperationNumberRows` 1〜5)、始発/終着駅作業欄(出区・入区・路線外・接続タイプ・運番・入出区連携コード表示)、前後作業欄(入換「換」・増結「増」・解結「解」・「運番変更」+時刻)。右クリックで「出区列車に移動/前列車に移動/次列車に移動/入区列車に移動/運用表を開く」。
- ダイヤグラム: 出区○・入区△・増結●・解結▲印、在線表表示駅では作業横線が運用接続で連結、在線表非表示駅では列車線同士を円弧で接続し運番を表示。

---

## 4. 交差支障チェック(ViewCrossingCheck + CrossingCheckRule)

### 4.1 ルールのデータ構造(駅ごとに保持)

`origin/DiagramEdit/DiagramEdit/entDed/CentDedEki.h`:

- `enum class ETrackType`(平面交差チェックルールの番線属性):
  - `TrackType_Track`(0): 駅の番線(iTrackIndex=EkiTrackIndex)
  - `TrackType_Origin`(1): 路線の起点側(駅構外。iTrackIndex=駅Index — 分岐・環状で複数の「隣接方面」を区別するため)
  - `TrackType_Terminal`(2): 路線の終点側(同上)
  - `TrackType_Outer`(3): 路線外発着(iTrackIndex=OuterEkiIndex)
- `struct TrackContent { ETrackType eTrackType; int iTrackIndex; }`
- `struct CrossingCheckRule`:
  - `bool bEnable`(一時無効化可)
  - 前動作: `vector<TrackContent> BeforeFromTrackContentCont / BeforeToTrackContentCont`(移動元/先番線の**集合**。複数選択時は直積がすべて対象)、`bool bBeforeIsArrival`(false=出発時刻/true=到着時刻)、`bool bBeforeIsTsuuka`(false=停車/true=通過)
  - 後動作: `AfterFromTrackContentCont / AfterToTrackContentCont / bAfterIsArrival / bAfterIsTsuuka`(同形)
  - `int iHeadwaySecond`(時隔上限秒。既定60。この値**未満**で支障)、`int iHeadwaySecondMinimum`(時隔下限秒、Ver2.06.05追加。この値**以上**で支障。負値可 = 後動作が前動作より前でも検知)
  - `tstring strCaption`(説明文)
- 駅が `vector<CrossingCheckRule> m_CrossingCheckRuleCont` を保持(`getCrossingCheckRule(idx)` 等)。
- ルール編集 UI は駅ビュー側: `ViewEki/CDlgCrossingCheckRule`、`ViewEki/CPropEditUi_CrossingCheckRule`(追加・コピー・削除・上下並べ替え・有効無効)。
- 選択可能な組合せ制約(説明.txt): 出発時刻×停車 → From は番線のみ/To は番線・駅出発・路線外。到着時刻×通過 → From は駅到着・路線外のみ/To は番線。など(通過は「駅構外・路線外→番線」「番線→駅構外・路線外」に限定されるため)。

### 4.2 チェック実行(ビュー内実装)

ビュー: `CCrossingCheckDoc`(`m_strDiaName` + `m_iEkiID` を保持 = **ダイヤ×駅**ごとに開く)、`CCrossingCheckView`、実体 `CWndDcdGridCrossingCheck`(3,627行)。時刻表ビューの駅名欄右クリック「交差支障チェックリストを開く」から起動。

アルゴリズム(`CWndDcdGridCrossingCheck::OnUpdate_All()`、cpp 1242行〜):

1. **番線空間の平坦化**: 当駅の全番線 + 分岐・環状で同一駅群になっている各駅の起点側/終点側(TrackType_Origin/Terminal) + 路線外発着駅を通し番号にマップ(`m_MapTrackContentToList` / `m_MapListToTrackContent` / 表示名 `m_strTrackNameCont`)。
2. **全列車の「動作」抽出**: 下り上り×全列車について当駅(と分岐・環状の同一駅群)の駅時刻を調べ、`CrossingCheckSearch {RessyaProperty(時刻含む), iEkiIndex, FromTrackContent, ToTrackContent, iShiftSecond}` を生成し、`InsertCrossingCheckSearch(from, to, search, iType)` で3種のリストへ**時刻順に挿入**する:
   - `m_CrossingCheckSearchContArrival[from][to]`(iType=0: 停車の到着動作。駅構外/路線外/前の入換番線 → 発着番線)
   - `m_CrossingCheckSearchContDeparture[from][to]`(iType=1: 停車の出発動作。番線 → 駅構外/路線外/次の入換番線)
   - `m_CrossingCheckSearchContTsuuka[from][to]`(iType=2: 通過。駅構外→番線と番線→駅構外の2動作を登録)
   - 停車は着時刻・発時刻の両方があれば到着動作・出発動作の両方を登録する。片方しか時刻が無い停車も対象で、存在する側の動作のみ登録する(着時刻のみ → 到着動作 iType=0、発時刻のみ → 出発動作 iType=1。Ver2.06.20 で「停車で発時刻もしくは着時刻のみの場合の処理」が修正された挙動。`origin/OuDiaSecond変更箇所.txt`)。着発とも時刻なしの場合のみ対象外(コード内コメント「停車の場合は、両方とも時刻があることを必須とします」は古く、実装は片時刻停車を処理する)。前作業/後作業コンテナは `SearchBeforeOperationCont` / `SearchAfterOperationCont` で走査し、**入換(番線間移動)、出区/入区(動作なしとして端点扱い)、路線外始発/終着(路線外→番線等)も動作として登録**。増結前・解結後コンテナも対象。下り列車は起点側から到着し終点側へ出発、上りは逆。分岐・環状で着駅と発駅が分かれるケース(運行なし区間を挟む同一駅群)も対応。
   - パターンダイヤプレビュー有効時は ±Range 分のコピー動作も `iShiftSecond` 付きで挿入。
3. **ルール評価**(cpp 2175行〜): 有効な各ルールについて、Before の From×To 集合に該当するリストを時刻順マージ(`MergeCrossingCheckSearchCont`)して `BeforeCont`、同様に `AfterCont` を作る。`BeforeCont` を順に走査し、各前動作の時刻に `iHeadwaySecondMinimum` / `iHeadwaySecond` を加えた `[MinimumJikoku, MaximumJikoku)` に入る後動作を、ソート済みリストの2ポインタ(`itrAfterTemp` で走査開始位置を前進)で列挙する。時刻比較はダイヤグラム起点時刻 `m_KitenJikoku` 基準の循環比較(`CdDedJikoku::compare(x, kiten)`)。
   - **同一動作同士(列車プロパティ・From・To がすべて一致)は除外**。
   - パターンプレビュー時は前動作が元列車(iShiftSecond==0)の場合のみ結果化。
   - ヒットは `CrossingCheckContent {Before側(列車プロパティ/駅Index/From/To), After側(同), iHeadway(秒差)}` として `m_CrossingCheckContentCont[ルールIndex]` へ。
4. **表示**: 行構成は `CrossingCheckColSpec/CdCrossingCheckYColSpec.h` の `ColumnType_Caption`(ルール見出し行: 「N. ルール名 [無効] 前動作着/発・通過… 時隔下限〜上限」)+ `ColumnType_Ressya`(該当列車組の行)。列(`CdCrossingCheckXColSpec.h`): Before側 `Ressyahoukou / Ressyabangou / Ressyasyubetsu / Jikoku / From / Arrow / To`、中央 `Headway`、After側同形。該当なしのルールは見出しのみ。
5. **更新は自動でない**: 列車編集後の再チェックはビューを開き直す(説明.txt)。操作は「時刻表へ移動(Enter)」「ダイヤグラムへ移動(F8)」。

計算量: ルール毎に O(|Before| + |After| + ヒット数)(時刻ソート済みリストの片側走査)。動作抽出は O(列車数 × 対象駅時刻数)。

### 4.3 用途パターン(説明.txt ＜設定の手引き＞)

発→発(続行間隔・開通時隔・平面交差)、着→着(追い込み時隔)、発→着(続行時隔・交差支障時隔・折り返し番線の空き待ち)、着→発(折り返し時間チェック)の4パターン×同一番線/異番線。

---

## 5. ファイルフォーマット(.oud2, UTF-8 BOM付き)

出典: `OuDiaSecond説明.txt` の FileType 変更履歴、および `origin/DiagramEdit/manual/sample2.oud2` で実物確認。パース実装は `entDed/CconvCentDed.cpp`(現行) と旧版 `CconvCentDedS00/S05/S09.cpp`、oud(本家)互換は `CconvCentDedOud.cpp`。

### 5.1 駅作業(列車ノード内)

```
Operation<駅Order><B|A>=<作業>,<作業>,...
Operation<駅Order><B|A>.<親作業Index><B|A>=...   ← 増結編成前作業/解結編成後作業(入れ子)
```

例(sample2.oud2): `Operation13B=2/0$1/034`、`Operation13B.0A=5/$2`。

作業リテラル(スラッシュ・ドル・セミコロン区切り):

- 入換 `0/[番線Index]$[入換発hhmmss]/[入換着hhmmss]$[0or1(当駅着発時刻扱い)]`
- 増結 `1/[0or1(増結位置)]$[増結時刻]`
- 解結 `2/[0-2(解結位置)]$[1-10(編成数)]/[解結時刻]`
- 出区/入区 `3/[時刻]$[連携コード]/[運番];[運番];…`(運番は出区のみ)
- 路線外始発/終着 `4/[路線外駅Index]$[発時刻]/[着時刻]$[連携コード]/[運番];…`
- 前/次列車接続 `5/[起点or終点時刻]$…`(前列車接続は `$[仮運番];…`、次列車接続は `$[0-3(接続タイプ)]`)
- 運用番号変更 `6/[運番];[運番];…`(空 = 運用番号順反転、FileType1.13〜)

### 5.2 交差支障チェックルール(駅ノード内、FileType1.11〜)

```
CrossingCheckRule.
Caption=開通時隔
Enable=1
HeadwaySecond=90
HeadwaySecondMinimum=0        (1.13〜)
BeforeFromTrackContentCont=0$0;0$1;0$2;0$3    ← [TrackType]$[Index] をセミコロン連結
BeforeToTrackContentCont=2$0
BeforeIsArrival=0
BeforeIsTsuuka=0
AfterFromTrackContentCont=...
AfterToTrackContentCont=...
AfterIsArrival=0
AfterIsTsuuka=0
.
```

### 5.3 関連キー

- 路線: `EnableOperation=[0-2]`、`OperationNumberReverse`、`OperationCrossKitenJikoku=[1]`
- 駅: `EkimeiDiaRyaku`(運用一覧図用略称)、`OperationTableDisplayJikoku=[1]`(箱ダイヤ表示駅)、`JikokuhyouOperationOrigin*` 系(前後作業欄表示設定)
- DispProp: `OperationNumberRows=[1-5]`、`DisplayInOutLinkCode`、`OperationTableFont`、`AllOperationTableJikokuFont`、`OperationStringColor`、`OperationGridColor`
- WindowPlacement: `WindowType=[0-6]`(5=運用一覧表、6=運用一覧図)

---

## 6. Web再実装に向けた論点

### 6.1 アーキテクチャ上の難所

1. **交差支障チェックのロジックがビュー内にある**: 動作抽出〜ルール評価のすべてが `CWndDcdGridCrossingCheck::OnUpdate_All()` に埋め込まれている。Web版では「駅の動作イベント抽出」「ルール評価」を純関数としてドメイン層へ抽出すべき(入力: ダイヤ+駅+ルール、出力: `CrossingCheckContent[]`)。グリッド描画とは完全に分離可能。
2. **CDedOperationConnecter の規模と副作用**: 10,247行。探索の副作用として (a) 各作業エンティティの※フィールドへの運番書き込み、(b) `CentDedDia::m_contOperationTableContent`、(c) カスタマイズ時刻表の列構成(`CustomizeJikokuhyouContent`)、(d) 在線表・ダイヤグラム描画用の接続方向/時刻、を同時に生成する。**「運用グラフの構築」と「各ビュー用の射影」を分ける**再設計が妥当。運用チェーンを first-class のグラフ(ノード=作業、エッジ=接続)として持てば、運用表・一覧表・一覧図・ダイヤグラム接続表示はすべてその射影になる。
3. **汎用スロットの型崩壊**: `m_bBoolData1` / `m_iIntData1` / `m_JikokuData2` 等が作業種類ごとに意味を変える。TypeScript では discriminated union(`type BeforeOperation = ShuntOp | ConnectOp | ReleaseOp | OutOp | OuterStartOp | JunctionOp | NumberChangeOp`)で再定義するのが自然で、oud2 シリアライズ形式(種類コード+位置引数)とも整合する。
4. **手入力値と探索導出値の混在**: ※印フィールド(割り当て運番、接続時刻、接続方向など)は探索のたびに書き換わる導出データ。永続化対象(手入力)と導出キャッシュを分離しないと undo/redo・差分更新が破綻しやすい。
5. **入れ子の増結前・解結後作業**: 作業ツリー(前作業列の中に増結、その中にまた前作業列…)を `iLevel: vector<int>` の階層パスでフラット化して探索している。Web版では素直に再帰構造+パスで扱えばよいが、「開始作業は先頭のみ/終了作業は末尾のみ」という正規化制約(`adjustOperation`)の維持が必要。
6. **分岐駅・環状線との相互作用**: 運用探索・交差支障とも、駅Order↔駅Index変換、同一駅群(`getEkiIndexBrunchLoop` / `isSameBrunchLoopGroup`)、反転駅設定が全面に絡む。駅トポロジの抽象(「物理駅」と「路線上の駅出現」の分離)を先に固めるとどちらも大幅に単純化する。
7. **時刻の循環比較**: `CdDedJikoku::compare(other, kitenJikoku)` によるダイヤグラム起点時刻基準の24時間循環比較と、`OperationCrossKitenJikoku`(起点跨ぎ接続の許否)。Web版の時刻型にも「基準時刻付き比較」が必須。

### 6.2 Windows/MFC 依存(除去対象)

- Doc/View、`OnUpdate`/`lHint` による差分更新プロトコル、`CWaitCursor`、キー入力転送(`CKeyinputSenderToModalDlg`)、印刷ページ分割(`CaDcdAllOperationTable2_PageSelector`)。
- OpenMP(`#pragma omp parallel for`)による探索並列化 → Web では Web Worker への切り出し(編集毎全再探索なので、大規模路線では worker + デバウンス + 「更新一時停止」相当の仕組みを推奨。既に本家にも一時停止UIがあることが規模の証左)。注意: 並列化は Step1 の列車走査だけでなく、Step2・Step3 の運用チェーン連結自体も起点単位の `parallel for schedule(guided)` + `omp critical` による共有状態保護で行われている。共有メモリ前提のこの設計は Web Worker(メッセージパッシング)へ素直に移らないため、Web 版では「起点ごとに独立計算 → 結果マージ」への再設計、または単一 worker 内逐次処理で十分かの性能検証が必要。
- グリッド描画は DcDrawLib 上の自前セル描画 → HTML table / canvas / 仮想スクロールで置換可能。列仕様(ColSpec)の「列番号→表示内容」写像という設計自体は移植しやすい。

### 6.3 単純化できる点

- `offsetof` による包含側逆参照 → 通常の親参照 or ID。
- Doc クラス群(ほぼ識別子のみ) → ルーティングパラメータ(diaId, operationNumber, ekiId)で十分。
- 運用一覧表(グリッド)と運用一覧図(グラフ)は同一データ(`OperationTableContent` 群 + ソート)の2表現なので、Web では 1 つのビューモデル+2レンダラで実装可能。
- 交差支障チェックの「開き直しで更新」仕様は、純関数化すればリアクティブ更新に自然に置き換えられる(ただし計算コストに注意)。
- CSVエクスポート2系統(`CconvOperationTableCsv` / `CconvAllOperationTableCsv`)は表示用ビューモデルの文字列化であり、ビューモデル共通化で統合できる。

### 6.4 再実装時の互換性チェックポイント

- 運番接尾辞「;n」の付与・除去(同一運番の複数回出区)。
- 空白運番・仮運用番号のフォールバック規則(前列車が見つからない前列車接続)。
- 折り返し時の運番反転、増結位置(前/後)による運番配列の結合順、解結位置3モードの分割規則。
- 入出区連携コードの 1:1 成立条件(重複で無効。`OperationCrossKitenJikoku`=false 時はペアが起点時刻を跨ぐ場合も無効 = iStatus 3)。
- 隠し種別の除外規則、運休列車(`Canceled`)の除外。
- 時隔判定の境界(下限**以上**・上限**未満**、下限は負値可)。
