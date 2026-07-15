# その他ビュー分析 — 路線ビュー・駅ビュー・列車種別ビュー・コメントビュー・入出区連携コード一覧

対象: OuDiaSecond ver 2.06.23
調査範囲:

- `origin/DiagramEdit/DiagramEdit/ViewRosen/`
- `origin/DiagramEdit/DiagramEdit/ViewEki/`
- `origin/DiagramEdit/DiagramEdit/ViewRessyasyubetsu/`
- `origin/DiagramEdit/DiagramEdit/ViewComment/`
- `origin/DiagramEdit/DiagramEdit/ViewInOutLinkCodeList/`
- マニュアル `origin/DiagramEdit/manual/oudia_manual/c03_reference/` の c02_rosenview / c03_ekiview / c04_ressyasyubetsuview / c07_commentview / c08_dialog / c09_gridview

記述の凡例: 本文中のクラス名・フィールド名・列挙値はソース原文のまま。「(推測)」と明記した箇所以外はソースまたはマニュアルで確認した事実である。

---

## 1. 概要

OuDiaSecond のメインウインドウは「左ペイン = 路線ビュー(ツリー)」+「右ペイン = 各編集ビュー(MDI 的に切替)」という構成をとる。本書が扱うのは、時刻表ビュー・ダイヤグラムビュー以外の編集ビュー群である。

| ビュー               | 実装                                                                                                   | UI形式                        | 編集対象                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------- |
| 路線ビュー           | `ViewRosen::CDlgRosenView`(モードレスダイアログ) + `CRosenViewTreeCtrl`                                | ツリー                        | なし(ナビゲーションのみ)                           |
| 駅ビュー             | `ViewEki::CEkiDoc`/`CEkiView`/`CWndDcdGridEki`                                                         | グリッド                      | `CentDedEki`(駅)                                   |
| 列車種別ビュー       | `ViewRessyasyubetsu::CRessyasyubetsuDoc`/`CRessyasyubetsuView`/`CWndDcdGridRessyasyubetsu`             | グリッド                      | `CentDedRessyasyubetsu`(種別)                      |
| コメントビュー       | `ViewComment::CDedCommentDoc`/`CDedCommentView`                                                        | テキストエディタ(`CEditView`) | 路線ファイルのコメント文字列                       |
| 入出区連携コード一覧 | `ViewInOutLinkCodeList::CInOutLinkCodeListDoc`/`CInOutLinkCodeListView`/`CWndDcdGridInOutLinkCodeList` | グリッド(参照専用)            | `CentDedDia` 内の `InOutLinkCodeContent`(集計結果) |

共通アーキテクチャ:

- 各ビューは MFC Doc/View のサブドキュメント(`CHidemdiSubDoc` 派生の Doc + `CView` 派生の View)。Doc クラスは「特に処理はありません」とコメントされる空クラスで、実体はビューに内包されるグリッドウインドウ(`CWndDcdGrid` 派生)が担う(例: `ViewEki/CEkiDoc.h`、`ViewEki/CEkiView.h` は `CWndDcdGridEki* m_pCWndDcdGrid` を包含し操作を委譲)。
- 編集はすべて「編集コマンドオブジェクト」(`DedRosenFileData/EditCmd/CRfEditCmd_*`)を生成し、ルートドキュメント `CDiagramEditDoc::executeEditCmd()` 経由で実行する。各コマンドは `createUndoCmd()` を持ち、これが Undo/Redo の基盤(コマンドパターン)。
- ビューの更新は `OnUpdate(pSender, lHint, pHint)`。`pHint` に実行された `CRfEditCmd` が渡り、部分更新を行う。非アクティブ時の全更新要求は `m_bWaitForActivate` フラグで保留し、アクティブ化時にまとめて反映する(`ViewEki/CWndDcdGridEki.h`)。
- `lHint == LHINT_SUBVIEW_TO_ROOTDOC` は「ビュー内容をルートDocに書き戻せ」という指示(コメントビューが利用。§6)。

---

## 2. 共通基盤: グリッド形式ビュー(c09_gridview)

駅ビュー・列車種別ビュー・時刻表ビュー等は「グリッド形式ビュー」(Excel 様の表)で、操作体系が共通する(マニュアル `c09_gridview/gridview.htm`)。

### 2.1 操作体系(マニュアル記載)

- **フォーカスセル**: 点線枠のセル。メニュー・ダイアログによる編集操作は原則フォーカスセル位置に適用。矢印キーまたはクリックで移動。
- **スクロール**: スクロールバー、フォーカスセル追従、PageUp/PageDown(上下)、Home/End(左右)、マウスホイール(縦)。
- **箱型複数選択**: Shift+矢印、またはマウス左ドラッグ。選択セルは色反転表示。複数選択中の編集操作は選択セル全部に適用(適用困難な操作を除く)。
- **選択解除**: Shift/Ctrl なしのフォーカス移動。
- **ランダム選択**: Ctrl+クリックでセル単位のトグル。Ctrl+矢印で選択維持のままフォーカス移動、Ctrl+Space でフォーカスセルの選択トグル。離れた複数セルを選択できる。
- 編集単位は「アイテム(横一行)」。Excel のようなセル単位のコピー&ペーストはできない(駅ビュー = 駅1行単位、種別ビュー = 種別1行単位)。

### 2.2 実装パターン

- グリッド本体は自前描画ライブラリの `DcDrawLib::DcdGrid::WndDcdGrid3::CWndDcdGrid`(`origin/libs/DcDrawLib/`)。各ビューはこれを継承した `CWndDcdGridXxx` を実装する。
- **ColSpec パターン**: 「グリッドの列/行番号 ⇔ 表示内容」の対応表を `CdXxxXColSpec` / `CdXxxYColSpec`(単純データクラス、NULL 状態あり)と、そのコンテナ `CdXxxXColSpecCont` / `CdXxxYColSpecCont` で表す。対応表はデータ変更のたびに `createXColSpecCont()` / `createYColSpecCont()` で再生成する。`getXColSpecOfFocus()` でフォーカス位置の意味を取得する(`ViewEki/EkiColSpec/`、`ViewRessyasyubetsu/RessyasyubetsuColSpec/`、`ViewInOutLinkCodeList/InOutLinkCodeListColSpec/`)。
- **createCmd パターン**: グリッドの選択状態から編集コマンドを生成する `createCmd(ECreateCmd, Ou<CRfEditCmd_Xxx>*)`。`ECreateCmd` は `ECreateCmd_NewItem`(挿入位置に新規)/`ECreateCmd_Focus`(フォーカス1件)/`ECreateCmd_Sequence`(連続選択)/`ECreateCmd_Select`(非連続含む選択、`CaMuiSelect` で選択状態をコマンドへ写す)/`ECreateCmd_All`(全件)の5種(`ViewEki/CWndDcdGridEki.h`)。`ppCmd=NULL` で「実行可能かの判定のみ」ができ、メニューの有効/無効(`OnUpdateXxx`)に使う。
- 各メニューコマンドは `OnXxx_Process(BOOL bQueryEnable)` に実装され、`bQueryEnable=TRUE` は可否判定のみ・`FALSE` で実行+エラー表示、という二相構造。
- 行構成(駅ビューの例、`CdEkiYColSpec`): `ColumnType_Head`(ヘッダ行)/ `ColumnType_Head2`(ヘッダ2行目)/ `ColumnType_Eki`(駅行、駅Index保持)/ `ColumnType_NewEki`(最下部の新規追加行)。最下行にフォーカスがある状態での「プロパティ」は末尾挿入として動作する。

---

## 3. 路線ビュー(ViewRosen)

### 3.1 構成

- `CDlgRosenView` — 左ペインの路線ビュー本体。**モードレスダイアログ**(IDD_ROSEN_VIEW)として実装され `CMainFrame` に包含される。更新はルートDoc(`CDiagramEditDoc::UpdateAllSubDocviews`、`CDiagramEditDoc.cpp:774`)が `CDlgRosenView::OnUpdate` を直接呼ぶ。`OnUpdate` は `pHint` の編集コマンド種別を判定し、`CRfEditCmd_Comment`/`CRfEditCmd_Ressya`/`CRfEditCmd_Ressyasyubetsu`/`CRfEditCmd_RessyasyubetsuSwap`/`CRfEditCmd_Operation` では更新をスキップ、それ以外(`CRfEditCmd_Eki`、ダイヤ追加削除、路線名変更等)では `UpdateROSEN(const CentDedRosen*)` でツリー全体を作り直す(全 `DeleteAllItems()` → 再挿入。`CDlgRosenView.cpp`)。なお `CDlgRosenView.h` のコメントに現れる `CDiagramEditView` はソースコメント上の旧称で、実在しないクラスである。
- `CRosenViewTreeCtrl` — ツリーコントロール。`OuMfc::TreeCtrl::CTreeCtrlContextMenu` 派生で、アイテム位置(`Itemlocation` = ルートからのindex列)ごとに `IDR_MENU_ROSENVIEW_CONTEXT` の別サブメニューを表示する。

### 3.2 ツリー構造(`CDlgRosenView::UpdateROSEN`、CDlgRosenView.cpp)

```
[路線名 or "路線"]                      … image 0 (列車ピクトグラム)
 ├ [駅]                                … image 1
 ├ [列車種別]                          … image 2
 └ [ダイヤ]                            … image 3
    └ [(ダイヤ名)] × ダイヤ数          … image 4
       ├ [下り時刻表]                  … image 5 (別名設定あれば「(別名)時刻表」)
       ├ [上り時刻表]                  … image 6
       ├ [ダイヤグラム]                … image 7
       ├ [下りカスタマイズ時刻表]      … image 5
       ├ [上りカスタマイズ時刻表]      … image 6
       ├ [駅時刻表一覧]                … 駅時刻表アイコン
       └ [運用一覧]                    … 運用表アイコン
 └ [コメント]                          … (路線直下・ダイヤの後)
```

- 下り/上りの表示名は `CentDedRosen::getKudariDiaAlias()` / `getNoboriDiaAlias()`(空でなければ「(別名)+時刻表」)。
- ルート([路線])・[駅]・[ダイヤ] は常時展開状態(`TVIS_EXPANDED`)。

### 3.3 アイテム操作と遷移(`CDlgRosenView::onEnterItem(aItem, iAction)`)

`iAction`: 0=Enter、1=クリック(モーダルを出さない動作のみ)、2=ダブルクリック(モーダルを出す動作のみ)、3/4=コンテキストメニュー専用。

| アイテム               | 位置(Itemlocation) | 動作                                                                                                                                                                              |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 路線                   | [0]                | ダブルクリック/Enter → `CMainFrame::execCDlgRosenFileProp()`(路線ファイルのプロパティ、モーダル)                                                                                  |
| 駅                     | [0,0]              | クリック/Enter → `openCEkiDoc()`(駅ビュー)                                                                                                                                        |
| 列車種別               | [0,1]              | クリック/Enter → `openCRessyasyubetsuDoc()`                                                                                                                                       |
| ダイヤ                 | [0,2]              | ダブルクリック/Enter → `execCDlgDiaList()`(ダイヤ一覧、モーダル)                                                                                                                  |
| 下り時刻表             | [0,2,d,0]          | `openCJikokuhyouDoc(pDia, Ressyahoukou_Kudari, false, NULL)`                                                                                                                      |
| 上り時刻表             | [0,2,d,1]          | 同上 `Ressyahoukou_Nobori`                                                                                                                                                        |
| ダイヤグラム           | [0,2,d,2]          | `openCDedDiagramDoc(pDia)`                                                                                                                                                        |
| 下りカスタマイズ時刻表 | [0,2,d,3]          | `openCJikokuhyouDoc(pDia, Kudari, true, NULL)`(第3引数=カスタマイズ仕様)                                                                                                          |
| 上りカスタマイズ時刻表 | [0,2,d,4]          | 同上 Nobori/true                                                                                                                                                                  |
| 駅時刻表一覧           | [0,2,d,5]          | `openCEkiJikokuhyouListDoc(pDia, NULL)`                                                                                                                                           |
| 運用一覧               | [0,2,d,6]          | 通常 → `openCAllOperationTableDoc(pDia)`。iAction=3 → `openCDedAllOperationTable2Doc(pDia)`(箱ダイヤ運用表2)。iAction=4 → `openCInOutLinkCodeListDoc(pDia)`(入出区連携コード一覧) |
| コメント               | [0,3]              | `openCDedCommentDoc()`                                                                                                                                                            |

- 入出区連携コード一覧・運用一覧2の入口は、[運用一覧] アイテムの右クリックメニュー(`ID_MENUITEM_OPEN` / `ID_ALLOPERATIONTABLE2_OPEN` / `ID_INOUTLINKCODELIST_OPEN`、`CRosenViewTreeCtrl.cpp`)だけである。
- ダイアログにフォーカスがあってもメニューアクセラレータが効くように `PreTranslateMessage` をメインフレームに委譲している(Windows/MFC 固有の細工)。

---

## 4. 駅ビュー(ViewEki)

### 4.1 グリッドの列構成(`ViewEki/EkiColSpec/CdEkiXColSpec.h` の `EColumnType`)

行 = 駅(上から路線の起点順)。列は2モードある。**通常モード**:

| 列                            | 内容       |
| ----------------------------- | ---------- |
| `ColumnType_EkiIndex`         | 駅Index    |
| `ColumnType_Ekimei`           | 駅名       |
| `ColumnType_Ekijikokukeisiki` | 駅時刻形式 |
| `ColumnType_Ekikibo`          | 駅規模     |
| `ColumnType_EkiTrack2Count`   | 番線数     |
| `ColumnType_EkiBrunch`        | 分岐駅設定 |
| `ColumnType_EkiLoop`          | 環状線設定 |

**表示設定モード**(メニュー [表示]-[表示設定モードにする]、`m_bDisplaySettingMode`)では列構成が置き換わる。通常モードの先頭5列(`ColumnType_EkiIndex` 〜 `ColumnType_EkiTrack2Count`)は残るが、`ColumnType_EkiBrunch`・`ColumnType_EkiLoop` の2列は表示されず、代わりに列5以降が以下の45列(計50列)になる(`CdEkiXColSpecCont.cpp` の `size()`: 通常モード=7列、表示設定モード=50列):

- 作業欄設定: `ColumnType_OperationOriginDownBeforeUpAfter` / `ColumnType_OperationOrigin` / `ColumnType_OperationOriginDownAfterUpBefore` / 同 Terminal 3列(起点側・終点側の前後作業欄と増解結欄)
- `ColumnType_TrackOmit`(番線表示省略設定)
- カスタマイズ時刻表向け表示設定(下り/上り各16列): 着時刻表示・発着番線表示・発時刻表示・列車番号表示・運用番号表示・運用番号表示段数・列車種別表示・列車名号数表示・路線外前列車始発駅表示・路線外次列車終着駅表示・前列車列車番号/運用番号/運用番号段数/種別/列車名表示・入線時刻表示(`ColumnType_ChakuJikokuDisplayKudari` … `ColumnType_NyuusenJikokuDisplayNobori`)
- `ColumnType_DiagramTrackDisplay`(ダイヤグラム番線表示)、`ColumnType_DiagramRessyajouhouHyoujiKudari/Nobori`(ダイヤグラム列車情報表示)、`ColumnType_NextEkiDistance`(次駅までの距離)、`ColumnType_DiagramColorNextEki`(次駅間の背景色)、`ColumnType_OperationTableDisplayJikoku`(箱ダイヤでの時刻表示)

表示設定モードでは `OnEkiSettingNext/Prev(_Process)`(3系統: Next/Prev, Next2/Prev2, Next3/Prev3)で、フォーカス列の設定値を選択中の駅すべてに対して順送り/逆送りにトグル・サイクルできる。適用可能列は `ColumnType_OperationOriginDownBeforeUpAfter` 〜 `ColumnType_OperationTableDisplayJikoku` の範囲に限定(`CWndDcdGridEki.cpp`)。設定間の依存関係(例: 前後作業欄は駅時刻形式が「発時刻」以外の場合のみ有効、前作業欄が無ければ増解結欄も無し)もここで強制される。

### 4.2 メニューコマンド(`CWndDcdGridEki.h` / マニュアル c03_ekiview)

- [編集]: 元に戻す/やり直し(ルートDoc)、切り取り・コピー・貼り付け・消去(駅1行単位、クリップボード経由)、[駅を挿入...]、[駅の反転](全駅順序反転=全下り列車と上り列車が入れ替わる)、[駅のプロパティ...](ダブルクリックでも起動)、[交差支障チェックルール編集](OuDiaSecond 追加)。
- [ファイル]: [路線ファイルの組入れ](他ファイルの内容を任意位置に追加)/[路線ファイルの切り出し](一部駅間のみの新ファイル作成)。→ §8 のダイアログ。

### 4.3 駅プロパティの全項目(エンティティ `entDed/CentDedEki.h` + UI `ViewEki/CPropEditUi_Eki.h` の `UIData_Eki`)

**基本**

| 項目                           | フィールド                                                                          | 値                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 駅名                           | `m_strEkimei`                                                                       | 必須                                                                                                                                                                                                                                                           |
| 駅時刻形式                     | `m_eEkijikokukeisiki` : `EEkijikokukeisiki`                                         | `Jikokukeisiki_Hatsu`(発時刻のみ・既定)/`Jikokukeisiki_Hatsuchaku`(発着)/`Jikokukeisiki_KudariChaku`(下り着)/`Jikokukeisiki_NoboriChaku`(上り着)/`Jikokukeisiki_KudariHatsuchaku`(下り発着・Second追加)/`Jikokukeisiki_NoboriHatsuchaku`(上り発着・Second追加) |
| 駅規模                         | `m_eEkikibo` : `EEkikibo`                                                           | `Ekikibo_Ippan`(一般駅=細線)/`Ekikibo_Syuyou`(主要駅=ダイヤグラム太罫線)                                                                                                                                                                                       |
| 境界線                         | `m_bKyoukaisen`                                                                     | 時刻表ビューの横罫線。**OuDiaSecond ではプロパティUIから編集不可**(`UIData_Eki` で `iKyoukaisen` がコメントアウト)。旧 OuDia ファイル読込互換のためエンティティには残存(`CconvCentDedS00.cpp`/`CconvCentDedOud.cpp` が set)                                    |
| ダイヤグラム列車情報 下り/上り | `m_eDiagramRessyajouhouHyoujiKudari/Nobori` : `EDiagramRessyajouhouHyouji`          | `DiagramRessyajouhouHyouji_Origin`(始発なら表示・既定)/`_Anytime`(常に表示)/`_Not`(表示しない)                                                                                                                                                                 |
| 駅時刻を駅時刻形式で正規化     | (UI設定 `bAdjustByEkijikokukeisiki`、`CWndDcdGridEki::m_bAdjustByEkijikokukeisiki`) | ON で OK 時に全ダイヤ全列車の駅時刻を形式に合わせ変換。既定 true、**.ini に保存**                                                                                                                                                                              |

**番線・路線内トポロジ(OuDiaSecond 拡張)**

| 項目                       | フィールド                                                                            | 説明                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 番線                       | `m_CentDedEkiTrack2Cont`(`CXEkiTrack2Cont`、要素 `CentDedEkiTrack2`)                  | 各番線 = 番線名 `m_strTrackName`・時刻表略称 `m_strTrackRyakusyou`・上り略称 `m_strTrackNoboriRyakusyou`(空なら下り略称を共用)。リストUIで追加/編集/削除/上下移動                 |
| 下り/上り本線              | `m_iDownMain` / `m_iUpMain`                                                           | 主本線となる番線Index(UI では EkiTrack2 リストの [下り本線][上り本線] ボタン)                                                                                                     |
| 番線のダイヤグラム表示省略 | `m_bDiagramTrackOmit` : `vector<bool>`                                                | 番線ごとの省略スイッチ                                                                                                                                                            |
| 分岐駅設定                 | `m_iBrunchCoreEkiIndex`(基幹駅Index、OFF=-1)、`m_bBrunchOpposite`                     | この駅を分岐扱いにして基幹駅と接続                                                                                                                                                |
| 環状線設定                 | `m_iLoopOriginEkiIndex`(起点駅Index、OFF=-1)、`m_bLoopOpposite`                       | 環状線の折返し設定                                                                                                                                                                |
| 分岐/環状の内部キャッシュ  | `m_iBrunchLoopPosition`、`m_iEkiIndexBrunchOriginSide/Loop/BrunchTerminalSide`(deque) | 駅グループ管理用                                                                                                                                                                  |
| 路線外発着駅               | `m_OuterTerminalCont` : `vector<OuterTerminal>`                                       | 各要素 = 駅名 `OuterTerminalEkimei`・時刻表略称 `OuterTerminalJikokuRyaku`(空なら駅名)・ダイヤグラム略称 `OuterTerminalDiaRyaku`(空なら頭文字)。リストUIで追加/編集/削除/上下移動 |
| 駅ID                       | `m_iID`                                                                               | 内部識別子                                                                                                                                                                        |
| 次駅までの距離             | `m_iNextEkiDistance`                                                                  | ダイヤグラム縦軸に影響                                                                                                                                                            |
| 次駅間の背景色             | `m_iDiagramColorNextEki`                                                              | `DIAGRAMBACKCOLOR_COUNT = 5` 色パレットのIndex                                                                                                                                    |

**時刻表(カスタマイズ時刻表)表示設定** — 下り/上り対で以下(いずれも `m_bJikokuhyou...` / `m_iJikokuhyou...`):

- 発着番線表示 `TrackDisplayKudari/Nobori`(bool)、番線表示省略 `m_bJikokuhyouTrackOmit`
- 着時刻表示 `ChakuJikokuDisplayKudari/Nobori`、発時刻表示 `HatsuJikokuDisplay...`、入線時刻表示 `NyuusenJikokuDisplay...`(bool)
- 列車番号表示 `RessyabangouDisplay...`、運用番号表示 `OperationNumberDisplay...`、運用番号表示段数 `OperationNumberDisplayRows...`、列車種別表示 `RessyaSyubetsuDisplay...`、列車名・号数表示 `RessyameiDisplay...`(int=段/形式の選択)
- 前列車(接続元)側の同項目: `PrevRessyabangouDisplay...` / `PrevOperationNumberDisplay(Rows)...` / `PrevRessyaSyubetsuDisplay...` / `PrevRessyameiDisplay...`
- 路線外始発/終着の表示: `OuterSihatsuDisplayKudari/Nobori`、`OuterShuchakuDisplayKudari/Nobori`(bool)
- 前後作業欄: 起点側/終点側の欄数 `m_iJikokuhyouOperationOrigin/Terminal`、増解結欄 `m_bJikokuhyouOperationOriginDownBeforeUpAfter` / `...OriginDownAfterUpBefore` / `...TerminalDownBeforeUpAfter` / `...TerminalDownAfterUpBefore`
- 駅名略称: 時刻表用 `m_strEkimeiJikokuhyouRyaku`、ダイヤグラム用 `m_strEkimeiDiagramRyaku`
- ダイヤグラム番線表示 `m_bDiagramTrackDisplay`、箱ダイヤ時刻表示 `m_bOperationTableDisplayJikoku`

**交差支障チェックルール(OuDiaSecond 拡張)** — `m_CrossingCheckRuleCont` : `vector<CrossingCheckRule>`(`CentDedEki.h`)

- `CrossingCheckRule` = 有効フラグ `bEnable`、前動作の移動前/後番線集合 `BeforeFromTrackContentCont`/`BeforeToTrackContentCont`(`TrackContent` = `ETrackType`{`TrackType_Track`(駅番線)/`TrackType_Origin`(起点側)/`TrackType_Terminal`(終点側)/`TrackType_Outer`(路線外発着)} + `iTrackIndex`)、前動作の到着/出発 `bBeforeIsArrival`・通過/停車 `bBeforeIsTsuuka`、後動作の同項目(After...)、時隔上限秒 `iHeadwaySecond`(既定60、負値可)、時隔下限秒 `iHeadwaySecondMinimum`(Ver2.06.05追加、`< iHeadwaySecond` 必須)、説明文 `strCaption`。
- 編集UIは `CDlgCrossingCheckRule`(IDD_CrossingCheckRule): ルール一覧リスト+追加/コピー/削除/上下移動、前後動作それぞれの From/To 番線複数選択リスト、到着/出発・通過/停車ラジオ、時隔上限/下限、有効チェック、説明文(`ViewEki/CDlgCrossingCheckRule.h`)。

### 4.4 駅プロパティダイアログの実装構造

- `CDlgEkiProp`(IDD_EkiProp)はモーダルダイアログだが、検証・データ授受のロジックは `CPropEditUi_Eki`(`OuLib::NsPropEditUi2::CPropEditUi2<UIData_Eki>` 派生)に分離される。ダイアログは内部クラス `CPropEditUiInternal` でこれを継承し、`CheckUiData` / `UiDataToTarget` 等のフックを実装する。
- `UIData_Eki` には各項目に対応する `bXxxEnable` フラグが多数あり(例 `bBrunchFunctionEnable`、`bJikokuhyouChakuJikokuDisplayKudariEnable`)、状況(駅の位置、駅時刻形式など)に応じたコントロールの活性制御に使う。
- グリッドからのキー入力を開いたモーダルダイアログのエディットに転送する仕掛け `CKeyinputSenderToModalDlg` がある(グリッドで文字を打つとダイアログが開いてそのまま入力が続く挙動)。
- 番線編集サブダイアログ `CDlgEkiTrack2Prop2`(IDD_EkiTrack2Prop2): 番線名・時刻表略称・上り略称・ダイヤグラム省略設定。路線外発着駅サブダイアログ `CDlgOuterEkimeiProp`(IDD_OuterEkimeiProp): 駅名・時刻表略称・ダイヤグラム略称。

### 4.5 駅の追加/削除/並べ替え時のデータ整合処理(`DedRosenFileData/EditCmd/CRfEditCmd_Eki`)

駅編集コマンド `CRfEditCmd_Eki` は「iIndexDst 位置の iSizeDst 個を、m_CentDedEkiContSrc の内容で置換」という汎用形(削除+追加の合成で置換を表現)。`execute()` の処理順:

1. **Undoデータ保存**: 正規化OFFかつ要素が増える/同数(駅時刻が失われない)なら削除対象駅のみ `m_pCentDedEkiContOld` に保存。正規化ONまたは要素減少(駅時刻が消える)なら **`CentDedRosen` 全体のコピー** `m_pCentDedRosen` を保存(コメント: 「駅の削除は、全列車の駅時刻の削除を伴います。このため、undo のためには CentDedRosen を保存する必要があります」)。
2. 置換前の分岐/環状グループ `getEkiIndexBrunchLoop()` を記録(置換=1駅編集の場合のみ)。
3. 減少分 `erase` → 同位置 `set` で置換 → 増加分 `insert`。
4. `pCentDedEkiCont->adjustBrunchLoopCont()` — 分岐・環状の内部インデックス再構築。
5. 正規化ONなら `pCentDedRosen->adjustByEkijikokukeisiki(駅Index)` — 着のみ/発のみの駅時刻を新しい駅時刻形式に合わせて着⇔発に移し替える(規則はマニュアル c04_dlgekiprop: 発時刻へ変更→「着あり発なし」を「発=旧着」に、下り着へ変更→下り列車の「発のみ」を「着=旧発」に、上り着も同様)。ただし交差支障チェックルール編集のみのコマンド(`getCrossingCheckRuleEdit()==true`)の場合は正規化ONでもスキップされる(実条件は `iRv >= 0 && !getCrossingCheckRuleEdit() && m_bAdjustByEkijikokukeisiki`)。
6. **番線・路線外発着駅の並べ替え追従**: ダイアログ内で番線/路線外駅を並べ替え・削除した場合、旧Index→新Index の対応表 `m_iEkiTrack2Map` / `m_iOuterTerminalEkimeiMap`(値 -1=削除)を受け取り、`pCentDedRosen->adjustBrunchLoopEkiTrack2OuterTerminal()` で**全ダイヤ・全列車の駅時刻が持つ番線指定を再マップ**する(これも `getCrossingCheckRuleEdit()==true` の場合はスキップ)。
7. 逆に交差支障チェックルール編集コマンド(`getCrossingCheckRuleEdit()==true`)の場合のみ `adjustCrossingCheckRule`(分岐/環状グループ内の他駅へルールを反映)。
8. 分岐駅・環状線設定の変更時は `adjustBrunchLoopByBrunchEdit` / `adjustBrunchLoopByLoopEdit`。駅挿入時は `m_iBrunchCoreEkiIndex` / `m_iLoopOriginEkiIndex` を挿入位置に応じて +1 補正。
9. `pCentDedRosen->adjustOperation()`(前後作業の整合)→ `adjustCrossingCheckRuleByEkiEdit()`(駅時刻形式・分岐環状の変化でルールが指す番線を補正。**adjustOperation の後**に実行される点に注意)→ 全ダイヤについて `pCentDedRosen->OperationConnect(idx)`(運用のつながりを再探索)。

新規駅の既定値: フォーカスが駅Index 0 の位置なら駅時刻形式を「上り着時刻」にする(`CWndDcdGridEki.cpp` コメント)。

---

## 5. 列車種別ビュー(ViewRessyasyubetsu)

### 5.1 グリッド列(`RessyasyubetsuColSpec/CdRessyasyubetsuXColSpec.h`)

`ColumnType_LineNo`(行番号)/ `ColumnType_Syubetsumei`(種別名)/ `ColumnType_Ryakusyou`(略称)/ `ColumnType_BackColor`(背景色)/ `ColumnType_DiagramLineStyle`(線スタイル、`CDcdFreeLine_StyleSample` でサンプル線を描画)/ `ColumnType_ParentSyubetsu`(親種別)/ `ColumnType_Hidden`(隠し種別)。

### 5.2 種別プロパティの全項目(`entDed/CentDedRessyasyubetsu.h` + `CPropEditUi_Ressyasyubetsu.h` の `UIData_Ressyasyubetsu`)

| 項目           | フィールド                                    | 値・意味                                                                                                                                                                                                   |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 種別名         | `m_strSyubetsumei`                            | 必須(空=無効オブジェクト)                                                                                                                                                                                  |
| 種別略称       | `m_strRyakusyou`                              | 時刻表の種別欄。半角6文字/全角3文字まで(マニュアル)                                                                                                                                                        |
| 時刻表文字色   | `m_colorJikokuhyouMojiColor` : `CdColorProp`  | ダイヤグラムの列車情報文字色を兼ねる。既定黒                                                                                                                                                               |
| 時刻表フォント | `m_iJikokuhyouFontIndex`                      | 0〜7 = 路線ファイルプロパティの『時刻表ビュー 1〜8』(`JIKOKUHYOUFONT_COUNT = 8`)                                                                                                                           |
| 時刻表背景色   | `m_colorJikokuhyouBackColor`                  | ダイヤのプロパティで背景色パターン=種別色の場合に使用。既定白(Second追加)                                                                                                                                  |
| ダイヤグラム線 | `m_CdDiagramLineStyle` : `CdDiagramLineStyle` | 線色 `m_colorDiagramSenColor`(既定黒)・線種 `m_eDiagramSenStyle` : `ESenStyle`{`SenStyle_Jissen`実線/`SenStyle_Hasen`破線/`SenStyle_Tensen`点線/`SenStyle_Ittensasen`一点鎖線}・太線 `m_bDiagramSenIsBold` |
| 停車駅明示     | `m_eStopMarkDrawType` : `EStopMarkDrawType`   | `EStopMarkDrawType_DrawOnStop`(停車駅を明示・既定)/`_Nothing`(明示しない)/`_DrawOnPass`(通過駅明示、未使用・予約)                                                                                          |
| 親種別         | `m_iParentSyubetsuIndex`                      | -1=OFF。0以上で親種別が有効(Second追加。派生種別のグルーピング)                                                                                                                                            |
| 隠し種別       | `m_bHidden`                                   | true でカスタマイズ時刻表・駅時刻表から当該種別の列車を非表示(Second追加)                                                                                                                                  |

`UIData_Ressyasyubetsu` の色は `CdColorPropNullable`(NULL可の色)で、複数選択編集時の「変更しない」を表現する。

### 5.3 メニューコマンドと整合処理

- [編集]: 切り取り/コピー/貼り付け/消去/[列車種別を挿入...]/[上へ][下へ]/[列車種別のプロパティ...](ダブルクリック同等)。
- **削除制約**: その種別を使う列車が存在する場合、切り取り・消去はエラー(`IDS_ERR_ExistRessyaOfRessyasyubetsu`、該当ダイヤ・方向をメッセージに表示)。加えて他種別の `ParentSyubetsuIndex` から参照されている場合もチェックする(`CWndDcdGridRessyasyubetsu.cpp`)。
- **並べ替え**([上へ][下へ])は専用コマンド `CRfEditCmd_RessyasyubetsuSwap` → `CentDedRosen::swapRessyasyubetsu(indexA, sizeA, indexB)`(`entDed/CentDedRosen.cpp`)。移動に伴い (1) 全種別の `ParentSyubetsuIndex` と (2) **全ダイヤ・全方向・全列車の `RessyasyubetsuIndex`** をシフト量計算で再マップする。Undo は逆方向の Swap コマンド生成。
- 追加/削除/置換は `CRfEditCmd_Ressyasyubetsu`(駅と同型の Index+Size+Src コンテナ方式)。

---

## 6. コメントビュー(ViewComment)

- `CDedCommentView` は **`CEditView` 派生**(Windows メモ帳相当のプレーンテキスト編集)。`CDedCommentDoc` は空。
- フォントは路線ファイルの表示プロパティ(`CdDedDispProp::m_fontpropViewComment`)を `OnUpdate()` で反映。
- 編集内容は即時にはモデルへ書かれない。`EN_CHANGE` で `m_bIsChanged = true` とし、`OnUpdate(lHint == LHINT_SUBVIEW_TO_ROOTDOC)` を受けた時点でエディット内容を取得し `CRfEditCmd_Comment`(改行を LF に正規化 `strLfOf`)を `executeEditCmd()` で実行、ルートDocに反映する(`CDedCommentView.cpp`)。つまり**遅延コミット+コマンド化で Undo 対象になる**。
- メニュー([編集]): 元に戻す/切り取り/コピー/貼り付け/消去/検索/次を検索/置換/すべて選択(マニュアル c07_commentview。検索・置換は Windows 標準ダイアログ)。

---

## 7. 入出区連携コード一覧ビュー(ViewInOutLinkCodeList)

### 7.1 入出区連携コード(InOutLinkCode)とは

- Ver2.05 で追加された**運用接続(車両運用のつながり)を跨ダイヤグラム外でも自動化するための任意文字列コード**。列車の前作業「出区」または「路線外始発」、後作業「入区」または「路線外終着」に設定できる(`entDed/CentDedBeforeOperation.h` の `m_strInOutLinkCode`、`CentDedAfterOperation` にも同フィールド)。
- 「入区・路線外終着」と「出区・路線外始発」に**同じコード**が設定されていると、運用接続時に入区側列車に割り当てられた運用番号が出区側列車へ自動で引き継がれる。
- ダイヤ単位の集計構造は `entDed/CentDedDia.h` の `map<tstring, InOutLinkCodeContent> m_contInOutLinkCodeContent`。`InOutLinkCodeContent` = 入区側列車群 `contInRessyaProperty` / 出区側列車群 `contOutRessyaProperty`(`CdDedRessyaProperty`)、状態 `iStatus`{0=出区のみ(連携無効)/1=入区のみ(無効)/2=1対1ペア(有効)/3=複数本または起点時刻跨ぎで無効}、運用接続処理用の `BeforeOperation` ポインタ、`strOperationNumber`。

### 7.2 ビューの内容

- **参照専用**のグリッド(編集コマンドなし)。ダイヤごとに開く(路線ビューの[運用一覧]右クリック→[入出区連携コード一覧])。
- 列(`CdInOutLinkCodeListXColSpec`): `ColumnType_InOutLinkCode`(コード)/ `ColumnType_InRessyahoukou`・`InRessyabangou`・`InRessyasyubetsu`(入区側の方向/列車番号/種別)/ `ColumnType_Arrow`(矢印)/ `ColumnType_OutRessyahoukou`・`OutRessyabangou`・`OutRessyasyubetsu`(出区側)/ `ColumnType_OperationNumber`(運用番号)。
- 1コードに複数列車が紐づく場合は `max(in数, out数)` 行に展開(`CWndDcdGridInOutLinkCodeList.cpp::OnUpdate_All`)。
- コンテキストメニューに「時刻表へ移動」(`OnInOutLinkCodeListMovetojikokuhyou`、該当列車の時刻表ビューへジャンプ)。CSV出力・ダイヤグラム移動等はコメントアウトされ未実装。
- `CInOutLinkCodeListDoc` はダイヤ名 `m_strDiaName` を保持しタイトルに使うのみ。

---

## 8. 主要ダイアログカタログ

### 8.1 ViewRosen 配下のダイアログ

| クラス(IDD)                                                | 役割・項目                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CDlgRosenFileProp`(IDD_RosenFileProp)                     | 路線ファイルのプロパティ。`CTabCtrl` に4ページを内包。編集データは内部クラス `CPropEditorData` に集約: 路線名/起点時刻 `m_jikokuKitenJikoku`/既定駅間幅 `m_iDiagramDgrYZahyouKyoriDefault`/運用機能有効 `m_iEnableOperation`/表示プロパティ `CdDedDispProp`/下り上りダイヤ別名/運用番号逆順 `m_bOperationNumberReverse`/起点時刻跨ぎ運用接続 `m_bOperationCrossKitenJikoku`/基準ダイヤIndex `m_iKijunDiaIndex`/隠し種別無効 `m_bDisableHiddenSyubetsu`                               |
| `CDlgRosenFileProp_Rosen`(路線ページ)                      | 路線名、駅名欄の幅(全角文字数、最大29)、運用機能の有効化、下り/上りダイヤ別名、運用番号逆順、運用番号段数 `m_iEDIT_OperationNumberRows`、起点時刻跨ぎ運用、基準ダイヤ、隠し種別無効                                                                                                                                                                                                                                                                                                  |
| `CDlgRosenFileProp_FontColor`(フォント・色ページ)          | `CdDedDispProp` を編集: 時刻表フォント1〜8(`m_arJikokuhyouFont[8]`、[1]Bold/[2]Italic/[3]Bold+Italic)、時刻表縦書き `m_fontpropJikokuhyouVFont`、ダイヤグラム駅名/時刻/列車フォント、運用表フォント `m_fontpropOperationTableFont`、運用一覧時刻フォント、コメントフォント。色: ダイヤ画面文字色 `m_colorDiaMojiColor`、列車色 `m_colorDiaRessyaColor`、縦横軸色 `m_colorDiaJikuColor`、基準運転時分の下限/上限/未定義/不正色(`m_colorStdOpeTime*Color`)、運用文字色・運用グリッド色 |
| `CDlgRosenFileProp_Jikokuhyou`(時刻表ページ・Second追加)   | 時刻表の列車の幅(半角4〜255。原作 OuDia の 4〜6 から OuDiaSecond で拡張、`DDV_MinMaxInt` に `edit_by_d_mania` コメント)、任意秒移動1/2(`m_iAnySecondIncDec1/2`)、列車名表示、路線外発着表示(始発側O/終着側T)、着/発時刻の秒丸め(`m_iSecondRoundChaku/Hatsu`)、24時以上表示 `m_bDisplay2400`、入出区連携コード表示 `m_bDisplayInOutLinkCode`                                                                                                                                          |
| `CDlgRosenFileProp_Diagram`(ダイヤグラムページ)            | ダイヤグラム起点時刻(0:00〜23:59)、既定の駅間幅(30〜1800秒。『ダイヤグラムエンティティY座標』単位=秒の生値を直接編集、既定値60。分⇔秒換算コードはコメントアウト済み。原作 OuDia の 1〜30分から OuDiaSecond で秒単位・上限30分相当に変更)、路線外発着の表示方法 `m_iEDIT_DiagramDisplayOuterTerminal`                                                                                                                                                                                 |
| `CDlgDiaList`(IDD_DiaList)                                 | ダイヤ一覧。リストボックス+[新規作成][プロパティ...][コピー](Second追加)[削除][上へ][下へ][閉じる]。OK/キャンセルなし=**即時反映**。ダブルクリックでプロパティ                                                                                                                                                                                                                                                                                                                       |
| `CDlgDiaProp`(IDD_DiaProp)                                 | ダイヤのプロパティ。ダイヤ名(空・重複不可)。Second追加: 時刻表背景色(メイン色Index/サブ色Index/背景パターンIndex、パレット `CentDedDia::JIKOKUHYOUCOLOR_COUNT` 色、プレビュー矩形描画)、パターンダイヤプレビュー有効+周期(秒/分)                                                                                                                                                                                                                                                     |
| `CDlgRosenfileInsert`(IDD_RosenfileInsert)                 | 路線ファイルの組入れ。組入れる .oud2 ファイル名(参照ボタン)+組入れ先駅(コンボ)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `CDlgRosenCreateSubRosen`(IDD_FILE_ROSEN_CREATE_SUB_ROSEN) | 路線ファイルの切り出し。新ファイルの始発駅/終着駅コンボ(始発>終着はエラー)+範囲外を路線外発着として残すか `m_bEnableOuter`                                                                                                                                                                                                                                                                                                                                                           |
| `CDlgDigitalJikokuhyouImport`(IDD_DigitalJikokuhyouImport) | デジタル時刻表(CSV)のインポート。下り1/上り1/下り2/上り2 の4ファイル指定+個別扱い無効化フラグ `m_bInvalidateIndividualHandling`                                                                                                                                                                                                                                                                                                                                                      |

### 8.2 マニュアル c08_dialog に列挙される全ダイアログ(参照)

| 節     | ダイアログ                     | 対応ビュー/機能                                          |
| ------ | ------------------------------ | -------------------------------------------------------- |
| 3.8.1  | 印刷ページ設定                 | 印刷余白(mm、小数可)                                     |
| 3.8.2  | 路線ファイルのプロパティ       | §8.1                                                     |
| 3.8.3  | 保存するダイヤの選択           | WinDIA形式保存時(1ダイヤのみ保存可のため選択)            |
| 3.8.4  | 駅のプロパティ                 | §4                                                       |
| 3.8.5  | 列車種別のプロパティ           | §5                                                       |
| 3.8.6  | ダイヤ一覧                     | §8.1                                                     |
| 3.8.7  | ダイヤのプロパティ             | §8.1                                                     |
| 3.8.8  | 列車のプロパティ               | 時刻表ビュー担当領域                                     |
| 3.8.9  | 駅時刻                         | 時刻表ビュー担当領域(駅扱=運行なし/停車/通過/経由なし等) |
| 3.8.10 | 時刻表ビューのプロパティ       | 貼り付け移動量(分)ほか                                   |
| 3.8.11 | ダイヤグラムビューのプロパティ | 横軸範囲・表示倍率ほか                                   |
| 3.8.12 | 駅時刻変更                     | 駅扱/着発時刻の一括変更                                  |
| 3.8.13 | 時刻表CSV出力                  | `CDlgOuJikokuhyouCsvExport`                              |
| 3.8.14 | 路線ファイルの組入れ           | §8.1                                                     |
| 3.8.15 | 路線ファイルの切り出し         | §8.1                                                     |

---

## 9. Web再実装に向けた論点

### 9.1 難所

1. **駅編集の整合カスケード**が本領域最大の複雑さ。駅の挿入/削除/置換は、全ダイヤ・全列車の駅時刻配列、番線Index、路線外発着駅Index、分岐/環状インデックス、交差支障チェックルール、前後作業、運用接続に波及する(§4.5 の 9 段の処理順をそのまま仕様化するのが安全)。特に `m_iEkiTrack2Map` / `m_iOuterTerminalEkimeiMap`(旧→新Indexの対応表、-1=削除)という「並べ替えの差分をコマンドに同梱する」設計は Web 版でも踏襲する価値が高い。
2. **Undo 戦略の非対称性**: 駅時刻が失われない編集は差分(旧駅オブジェクト)のみ、失われる編集(駅削除・正規化ON)は `CentDedRosen` 全体スナップショットで Undo する。Web 版では Immutable データ構造+構造共有にすればこの分岐自体を消せる(単純化ポイント)。
3. **種別の並べ替え**は「配列の入れ替え+全列車の種別Index再マップ+親種別Index再マップ」(§5.3)。種別削除は使用中チェック(列車・親種別参照)が必須。ID参照ではなく**配列Indexによる参照**がドメイン全体の基本になっている点に注意(駅・種別・番線・路線外駅すべて)。Web 版で安定IDに置き換えるなら、ファイルI/O(Index ベース)との相互変換層が要る。
4. **駅プロパティの項目数**が非常に多い(カスタマイズ時刻表向け表示設定が下り/上り対で約20組)。UIは「駅プロパティダイアログ」と「駅ビューの表示設定モード(グリッド上でのトグル一括編集)」の2系統があり、後者は複数駅選択に対する一括サイクル操作(`OnEkiSettingNext/Prev`)+項目間の依存制約(駅時刻形式が発時刻のみの駅では作業欄無効等)を持つ。

### 9.2 Windows/MFC 依存で置き換えが必要なもの

- 路線ビューはモードレスダイアログ+Win32 TreeCtrl+アイテム位置(index列)ベースのハードコード分岐。Web ではルーティング/状態管理で素直に表現できる(ツリーはナビゲーションのみで編集機能を持たない)。
- グリッドは自前描画(`DcDrawLib`)+`OnUpdate` 差分再描画+`CKeyinputSenderToModalDlg`(キー転送)という MFC 密結合。Web では仮想スクロールのグリッドコンポーネント+制御された入力で再構成。ColSpec(列番号⇔意味の対応表)という抽象は列構成が動的(表示設定モード、番線数で変わる時刻表列)なので引き継ぐ価値がある。
- クリップボード連携(駅・種別の行単位カット&ペースト)は独自フォーマットでレジスタする方式。Web ではアプリ内クリップボード(+可能なら `navigator.clipboard` にシリアライズ)で代替。
- 「駅時刻を駅時刻形式で正規化」フラグは .ini 保存(アプリ設定)。Web では localStorage 相当。
- コメントビューの検索/置換は Windows 共通ダイアログ。textarea+自前UIで代替容易。

### 9.3 単純化できる点

- Doc クラス群(`CEkiDoc` 等)は空であり、Web 版では「ビュー種別+パラメータ(ダイヤindex、方向)」のルーティング情報に還元できる。
- コメントビューの遅延コミット(`LHINT_SUBVIEW_TO_ROOTDOC`)は、フォーカス喪失/保存時に diff をコマンド化するだけでよい。
- 入出区連携コード一覧は純粋な派生ビュー(モデルの `m_contInOutLinkCodeContent` を表示するだけ)。リアクティブな算出プロパティとして実装すれば専用の更新処理は不要。
- ダイヤ一覧ダイアログの「即時反映」(OK/キャンセルなし)は、コマンド実行ベースなら Web でも同じ設計で成立する。

### 9.4 その他の注意

- ソースの文字コードは大部分が CP932 だが、OuDiaSecond で追加されたファイル(例 `entDed/CentDedBeforeOperation.h`)は UTF-8(BOM付き)のものが混在する。
- マニュアル(c02〜c09)は原作 OuDia 時点の記述で、OuDiaSecond 拡張(番線、分岐/環状、カスタマイズ時刻表表示設定、交差支障チェック、入出区連携コード、親種別/隠し種別、時刻表背景色等)はマニュアル未記載。仕様の一次情報はソースのみ。
- 境界線(`m_bKyoukaisen`)のように「エンティティ・ファイルI/Oには残るが UI から編集不可」の項目があるため、フィールドの存在= UI 要件とは限らない。
