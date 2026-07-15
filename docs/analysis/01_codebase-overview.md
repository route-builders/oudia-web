# OuDiaSecond コードベース全体とアプリ基盤の分析

対象: OuDiaSecond ver 2.06.23(C++/MFC、VS2019、GPLv3)。
本書は、アプリ全体構造(Doc/View)、Undo/Redo、描画ライブラリ DcDrawLib、プロパティ編集UI基盤 NsPropEditUi2、印刷・CSV変換、ビュー間更新通知を対象とする。
パスはすべて `origin/` からの相対。ソースコメントは Shift-JIS(CP932)。

---

## 1. プロジェクト構成(ビルド単位)

`DiagramEdit/DiagramEdit.sln` は3プロジェクト構成:

| プロジェクト | 種別 | 内容 |
|---|---|---|
| `DiagramEdit` (`DiagramEdit/DiagramEdit/DiagramEdit.vcxproj`) | Application (exe) | 本体。Doc/View、各 View サブディレクトリ、entDed、DedRosenFileData |
| `DiagramEditLibPrj` (`DiagramEdit/DiagramEditLibPrj/DiagramEditLibPrj.vcxproj`) | StaticLibrary | `libs/` 配下(DcDrawLib, OuLib, OuMfc)をまとめてビルドする静的ライブラリ |
| `OuDiaSecond_Setup` | vdproj | インストーラ |

- PlatformToolset v142、CharacterSet=Unicode(内部文字列は `TCHAR`/`tstring` = `std::wstring` 相当。`libs/OuLib/Str/tstring.h`)。
- ライブラリ層の名前空間: `DcDrawLib::{DcdCd, DcDraw, DcdGrid, DcDrawMfc, WinUtil}` / `OuLib::{NsOu, NsMu, Str, Dir, NsPropEditUi2}` / `OuMfc::{Hidemdi, FrameLeftPane, TreeCtrl, MfcUtil, OuDlg}`。
- アプリ層の名前空間: `entDed`(ドメイン)、`DedRosenFileData`(ファイルデータ+編集コマンド)、`ViewXxx` 各種、`Print`、`ConvJikokuhyouCsv`。

---

## 2. Doc/View アーキテクチャ — 「Hidemdi」モデル

### 2.1 コンセプト

`libs/OuMfc/Hidemdi/Hidemdi.h` に定義される **HIDEMDI アプリケーション** =
「SDI のように1アプリ1ファイルでありながら、MDI のように複数種類・複数個の編集ウインドウを開ける」構成。
1つの**ルートDoc**(ファイル全体のデータを保持、ビューなし・非表示)と、複数の**サブDoc/View**(ルートDocの一部分を編集するウインドウ)から成る。

### 2.2 Hidemdi 基盤クラス(`libs/OuMfc/Hidemdi/`)

| クラス | 基底 | 役割 |
|---|---|---|
| `CHidemdiApp` | `CWinApp` | ルートDocテンプレートを `RegisterRootDoctmpl()` で保持。`pRootDoc()`/`pRootDoctmpl()` を提供。`OnCmdMsg()` オーバーライドでコマンドメッセージをルートDocへ委譲。`OnFileNew/Save/SaveAs` を処理 |
| `CHidemdiRootDoctmpl` | `CMultiDocTemplate` | ルートDocテンプレート(アプリに1つ)。`OpenDocumentFile()` は既存ドキュメントを全部閉じてから開く(=SDI 的挙動)。`SaveAllModified()`/`CloseAllDocuments()` はサブDocview群へ先に伝播 |
| `CHidemdiRootDoc` | `CDocument` | ルートDoc基底。**`UpdateAllSubDocviews(pSender, lHint, pHint)`**: 全 DocTemplate を列挙し、ルート以外の全ドキュメントに `UpdateAllViews()` を呼ぶ(`CHidemdiRootDoc.cpp`)。`OnFileSave/SaveAs/Close` を処理 |
| `CHidemdiRootFrame` / `CHidemdiRootView` | `CMDIChildWnd` / `CView` | ルートDoc用のフレーム/ビューだが**常に非表示・実処理なし**(ルートDocは画面を持たない) |
| `CHidemdiSubDoctmpl` | `CMultiDocTemplate` | サブDoc/View 用テンプレート(Doc, Frame, View の3クラスを登録) |
| `CHidemdiDoctmplDocstrAlone` | `CHidemdiSubDoctmpl` | **同じ DocStr を持つドキュメントの二重オープンを防止**。`OpenDocumentFile()` で既存があればそれをアクティブ化して返す |
| `CHidemdiSubDoc` | `CDocument` | サブDoc基底。`m_strDocStr`(**ドキュメント文字列**: ルートDoc内でこのサブDocが編集する部分を特定する文字列)を持つ。`OnOpenDocument(lpszPathName)` の引数はファイルパスではなく DocStr として使われる |
| `CHidemdiMainfrm` | `CMDIFrameWnd` | メインフレーム基底。サブViewを開くのはメインフレームの責務 |
| `CDropTargetDoctmpl` | - | ファイルのドラッグ&ドロップ受付 |

`LHINT_SUBVIEW_TO_ROOTDOC = -1`(`CHidemdiRootDoctmpl.h`): `OnUpdate` の `lHint` にこれが渡ると「編集中データをルートDocへ反映せよ」の意味。各ビューの `OnUpdate` は冒頭でこれを判定して早期リターンする(例: `ViewJikokuhyou/CJikokuhyouView.cpp`)。

### 2.3 アプリ側の実装

**`CDiagramEditApp`**(`DiagramEdit/DiagramEdit/DiagramEdit.h/.cpp`、基底 `CHidemdiApp`):

- `InitInstance()` でルートテンプレート `CDiagramEditDoctmpl`(`IDR_DIATYPE`, `RUNTIME_CLASS(CDiagramEditDoc)`)を登録後、**12種のサブDoc/Viewテンプレート**を `CHidemdiDoctmplDocstrAlone` で登録し、メンバに保持:

| メンバ | Doc / View クラス | 画面 |
|---|---|---|
| `m_pdoctmplEki` | `CEkiDoc` / `CEkiView` | 駅 |
| `m_pdoctmplResssyasyubetsu` | `CRessyasyubetsuDoc` / `CRessyasyubetsuView` | 列車種別 |
| `m_pdoctmplJikokuhyou` | `CJikokuhyouDoc` / `CJikokuhyouView` | 時刻表(下り/上り/カスタム) |
| `m_pdoctmplDiagram` | `CDedDiagramDoc` / `CDedDiagramView` | ダイヤグラム |
| `m_pdoctmplComment` | `CDedCommentDoc` / `CDedCommentView` | コメント |
| `m_pdoctmplOperationTable` | `COperationTableDoc` / `COperationTableView` | 運用表 |
| `m_pdoctmplAllOperationTable` | `CAllOperationTableDoc` / `CAllOperationTableView` | 運用一覧表 |
| `m_pdoctmplAllOperationTable2` | `CDedAllOperationTable2Doc` / `CDedAllOperationTable2View` | 運用一覧図 |
| `m_pdoctmplEkiJikokuhyou` | `CEkiJikokuhyouDoc` / `CEkiJikokuhyouView` | 駅時刻表 |
| `m_pdoctmplEkiJikokuhyouList` | `CEkiJikokuhyouListDoc` / `CEkiJikokuhyouListView` | 駅時刻表一覧 |
| `m_pdoctmplInOutLinkCodeList` | `CInOutLinkCodeListDoc` / `CInOutLinkCodeListView` | 入出区連携コード一覧 |
| `m_pdoctmplCrossingCheck` | `CCrossingCheckDoc` / `CCrossingCheckView` | 交差支障チェック |

フレームクラスはすべて素の `CMDIChildWnd`。

- **`openCXxxDoc()` 群**: 各サブビューを開くファサード。DocStr を組み立てて `OpenDocumentFile(strDocument)` に渡す。
  例: `openCJikokuhyouDoc()` は `"<ダイヤ名>\n<列車方向(int)>\n<カスタマイズ時刻表(0/1)>"` を DocStr にする(`DiagramEdit.cpp` 259行付近)。ダイヤグラムはダイヤ名のみ、駅時刻表は `ダイヤ名\n方向\n駅Index` 等。
  **サブDocの同一性は「ダイヤ名」等の文字列キー**で管理されている(IDではない)点に注意。
- 設定永続化: `.ini`(PrivateProfile)を `%LOCALAPPDATA%\OuDiaSecondV2\OuDiaSecondV2.ini` に置く(`m_pszProfileName` 差し替え。`makeLocalAppdataFilename()` が LocalAppData 配下に `\OuDiaSecondV2\` を連結。LOCALAPPDATA 取得失敗時は `GetTempPath` へフォールバック)。ログは同フォルダの `OuDiaSecond.log`(`logmsg_setFilename`)。MRU は `LoadStdProfileSettings()`。
  `writeCWndDiagramViewProp()/readCWndDiagramViewProp()`、`writeCWndJikokuhyouViewProp()/read...` が各ビューの表示設定(ズーム率 `DcdPerDgrX/Y`、縦罫モード `DiagramVlineMode`、列車番号/列車名表示、秒表示 `Jikokuhyou_DisplaySecondEkiJikoku`、コロン表示、基準運転時分機能等)を `[AppProp]` セクションに読み書きする。
- CSVコンバータのファクトリ: `createCconvJikokuhyouCsv()` / `createCconvJikokuhyouCustomizeCsv()` / `createCconvOperationTableCsv()`。
- ファイルダイアログ用フィルタ: `getCFileDialogFilterOpen()`(「OuDiaSecond ﾌｧｲﾙ (*.oud2;*.oud)」の結合1エントリ+全ファイル)、`getCFileDialogFilterSave()`(OuDiaSecond(*.oud2)+OuDia(*.oud, `IDS_OriginalOuDiaFilter`)+全ファイル。保存ダイアログでも `.oud` を選択できる)、`getCFileDialogFilterCsv()`。

**`CMainFrame`**(`CMainFrame.h/.cpp`、基底 `CHidemdiMainfrm`):

- 包含: `CDlgRosenView m_CDlgRosenView`(左ペイン=路線ビュー、モードレスダイアログ)、`CWndSplitBarV m_CWndSplitBarV`(スプリッタ)、`CDedStatusBar m_wndStatusBar`、`CToolBar m_wndToolBar` / `m_wndToolBarDiagram`、`CDialogBar m_wndDialogBar`(列車番号検索ボックス `IDC_EDIT_Ressyabangou`)。
- `RecalcLayout()` オーバーライドで「左ペイン+スプリッタ+MDIClient」のレイアウトを自前配置(`libs/OuMfc/FrameLeftPane/CWndSplitBarV.h` の MDIFrameLeftPane パターン)。
- メニュー処理: `OnFileRosenFileInsert_Process`(路線ファイルの組み入れ)、`OnFileRosenCreateSubRosen_Process`(路線の切り出し)、`OnFileDigitalJikokuhyoufileImport_Process`(外部時刻表インポート)、`execCDlgRosenFileProp()`(路線ファイルのプロパティ)、`execCDlgDiaList()`(ダイヤの一覧)、バックアップON/OFF、ウインドウ配置復元ON/OFF。
- `getMDIChildActiveView()` でアクティブビュー取得。

**`CDlgRosenView`**(`ViewRosen/CDlgRosenView.h`): 左ペインのツリー(`CRosenViewTreeCtrl`)。路線/駅/列車種別/ダイヤ/時刻表(上下)/ダイヤグラム…のツリーアイテムをクリック・ダブルクリック・Enter で対応するビューを開く(`onEnterItem()`)。`UpdateROSEN(pCentDedRosen)` でツリーを再構築、`OnUpdate(pSender,lHint,pHint)` を持ち更新通知を受ける。CView ではなく CDialog なので MFC の Update 経路外(後述の通りルートDocが明示的に呼ぶ)。

**各サブViewの共通構造**: View は薄い `CView` で、実体は包含する子ウインドウ。
例: `CJikokuhyouView`(`ViewJikokuhyou/CJikokuhyouView.h`)は `CWndJikokuhyou* m_pCWndDcdGrid` を `OnCreate` で生成・`OnDestroy` で破棄し、`OnUpdate`/`OnCmdMsg`/サイズ変更/フォーカスをすべて子ウインドウへ委譲する。グリッド系ビュー(駅・駅時刻表・運用表・入出区・交差支障 等)は `CWndDcdGrid` 派生(`CWndDcdGridEki`, `CWndDcdGridOperationTable`, …)を包含する。

**ステータスバー** `CDedStatusBar`(`CDedStatusBar.h`): `CStatusBar` 派生。『貼り付け移動量』欄のダブルクリックで `ID_Jikokuhyou_ViewProp` コマンドを発行する程度の拡張。

**進捗通知**: `IfProgress`(`IfProgress.h`)は `onNotifyProgress(iNu, iDe)`(分子/分母、戻り値非0で中断要求)だけの純粋インターフェース。`CDlgProgress`(`CDlgProgress.h`)が CDialog+IfProgress 実装で Abort ボタンを持つ。長時間処理(ファイル変換等)に渡される。

---

## 3. ルートドキュメントとファイル I/O — `CDiagramEditDoc`

`DiagramEdit/DiagramEdit/CDiagramEditDoc.h/.cpp`(基底 `CHidemdiRootDoc`)。

- **データ本体**: `CDedRosenFileData m_CDedRosenFileData`(.oud/.oud2 ファイル内容の全体。`DedRosenFileData/CDedRosenFileData.h`)。
- **読み取り専用公開**: `getCDedRosenFileData()` は `const CDedRosenFileData*` のみ返す。**ドキュメントの変更は必ず `executeEditCmd(Ou<CRfEditCmd>)` 経由**、という規律がヘッダコメントで明文化されている。
- **開く** `OnOpenDocument()`: `stringFromFile()` で全文字列を読み(UTF-8 BOM を検出、なければ Shift-JIS とみなす: `libs/OuLib/Str/vectorToFile.cpp`)、`CconvCDedRosenFileData::CDedRosenFileData_from_string()` でパース。エラーは `COuErrorInfoContainer` に集約しメッセージボックス表示。
- **保存** `OnSaveDocument()`: 拡張子 `.oud` の場合は「一部の情報が失われます」と警告した上で `CconvCDedRosenFileDataOud` により旧OuDia形式へ変換し **ANSI(Shift-JIS)** で書き出し(`stringToFileANSI`)。それ以外(`.oud2`)は `CconvCDedRosenFileData` で `CNodeContainer`(OuPropertiesText のノードツリー)へ変換し、`FileTypeAppComment = "OuDiaSecond Ver. x.xx.xx"` を付与して `CConvNodeContainer::encode()` で文字列化し **UTF-8(BOM付き, `ccs=UTF-8`)** で書き出す。
- **ウインドウ配置のファイル内永続化**: `.oud2` には `WindowPlacement`/`ChildWindow` ノードとして、メインウインドウと各MDI子ウインドウの種類・ダイヤIndex・位置・サイズが保存される(`DedRosenFileData/CconvCDedRosenFileData.cpp` 121行付近、保存時に各ビューの `GetWindowPlacement()` を直接参照)。Doc 側は `vector<ChildWindow> m_contChildWindow` と `m_bWindowPlacementRestore` を持ち、開いた後に該当ビューを再オープンして配置する(`CDiagramEditDoc.cpp` 3063行付近)。`ChildWindow::iWindowType` は 0:下り時刻表 1:上り時刻表 2:ダイヤグラム 3:下りカスタマイズ時刻表 4:上りカスタマイズ時刻表 5:運用一覧表 6:運用一覧図。**GUI状態がデータファイルに混在している**点は Web 設計で分離すべき事項。
- **自動バックアップ**: `m_bBackupEnable` 有効時、`executeEditCmd()` の度に `backup()` を呼び、前回から `iBackupIntervalSecond = 60` 秒経過していればバックアップファイルを書く。`m_ttPrevBackup`, `m_strBackupPathName` で管理、無効化時はバックアップファイルを削除。
- **クリップボード**: 独自クリップボードフォーマットを static 関数群で提供 — `CentDedEki_To/From_Cliboard`(駅)、`CentDedRessyasyubetsu_...`(列車種別)、`CentDedRessyaCont_...`(列車群。貼り付け先コンテナの `m_eRessyaHoukou`/`m_iEkiCount` が一致している前提)、`CentDedOperation_...`(前後作業)、`RessyaJouhou_...`(列車情報)、`CentDedOperationTable_To_Cliboard`(運用表のテキスト)。それぞれ `getCF_...()` で `RegisterClipboardFormat` した値を返し、`..._IsClipboardFormatAvailable()` で貼り付け可否を判定(メニューの有効/無効に使用)。

---

## 4. Undo/Redo — コマンドパターン

### 4.1 コマンド基底 `CRfEditCmd`

`DedRosenFileData/EditCmd/CRfEditCmd.h`。純粋仮想2つ:

```cpp
virtual int execute( CDedRosenFileData* pCDedRosenFileData ) = 0;
virtual Ou<CRfEditCmd> createUndoCmd() = 0;
```

- `execute()` はドキュメントを変更し、**成功時に undo に必要な旧データをメンバに保持**する。
- `createUndoCmd()` は「`execute()` 直後の状態を直前の状態に戻す**逆コマンド**」を生成する(例: 列車削除コマンド → 同位置に削除した列車を追加するコマンド)。

### 4.2 具象コマンド(`DedRosenFileData/EditCmd/`)

| クラス | 対象 |
|---|---|
| `CRfEditCmd_Ressya` | 列車の追加・置換・削除(ダイヤIndex+方向+列車Index範囲) |
| `CRfEditCmd_RessyaSwap` | 列車の入れ替え |
| `CRfEditCmd_Eki` | 駅 |
| `CRfEditCmd_Ressyasyubetsu` / `_RessyasyubetsuSwap` | 列車種別 |
| `CRfEditCmd_Dia` / `_DiaProp` | ダイヤの追加削除 / ダイヤのプロパティ |
| `CRfEditCmd_Rosen` | 路線プロパティ |
| `CRfEditCmd_Comment` | コメント |
| `CRfEditCmd_Operation` | 運用 |
| `CRfEditCmd_DedRosenFileDataProp` / `_RosenFileData` | ファイル全体のプロパティ/全置換 |

`CRfEditCmd_Ressya` の構造(`CRfEditCmd_Ressya.h`)が典型例: 属性に `m_iDiaIndex`, `m_ERessyahoukou`, `m_iIndexDst`(置換先Index, INT_MAX=末尾), `m_iSizeDst`(削除数), `m_CentDedRessyaContSrc`(追加する列車群)、内部に `m_pCentDedRessyaContOld`(execute で削除した旧列車)。置換=削除+追加で表現。`CaMuiSelect<CentDedRessya> m_CaMuiSelect` はコンテナの部分選択アダプタで、**ビューでの複数選択(非連続含む)をコマンド内の選択状態に写す**(`CWndJikokuhyou::createCmd()` が生成元)。`m_bWaitOperationConnect` は連続入力時に運用探索を遅延させる最適化フラグ。

なお `entDed` 側の `CentDedRessya_EkijikokuModifyOperation2`(駅時刻の変更操作)や `CentDedBeforeOperation/CentDedAfterOperation`(前作業/後作業=運用のドメイン実体)は Undo コマンドではない。前者はコマンド内部で列車のコピーに適用する編集ヘルパ、後者は運用機能のエンティティ。**Undo 単位は常に `CRfEditCmd_*`**。

### 4.3 ドキュメント側の実行フロー(`CDiagramEditDoc.cpp`)

```
executeEditCmd(pCmd):
  1. pCmd->execute(&m_CDedRosenFileData)
  2. UpdateAllSubDocviews(NULL, 0, &CRfEditCmdHolder(pCmd))   // 全ビュー更新
  3. m_contUndo.insert(pCmd);  size > iUndoLevel(=8) なら先頭を捨てる
     m_contRedo.clear()
     m_iModifyCountFromDoc 更新 (負なら INT_MAX、それ以外 ++)
  4. SetModifiedFlag(m_iModifyCountFromDoc != 0)
  5. バックアップ有効なら backup()
```

```
undo():
  pCmd = m_contUndo 末尾
  pUndoCmd = pCmd->createUndoCmd(); pUndoCmd->execute(...)
  UpdateAllSubDocviews(NULL, 0, &CRfEditCmdHolder(pUndoCmd))
  m_contUndo 末尾を削除し、pCmd(元コマンド)を m_contRedo 末尾へ
  m_iModifyCountFromDoc--
redo():
  pCmd = m_contRedo 末尾; pCmd->execute(...) を再実行
  UpdateAllSubDocviews(NULL, 0, &CRfEditCmdHolder(pCmd))
  m_contRedo 末尾→m_contUndo 末尾へ移動; m_iModifyCountFromDoc++
```

- Undoスタック `m_contUndo`・Redoスタック `m_contRedo` は `CMup_deque< Ou<CRfEditCmd> >`。**深さは `iUndoLevel = 8`**(`CDiagramEditDoc.cpp` 119行、定数)。
- Redo は逆コマンドの逆ではなく**元コマンドの再 execute**。したがってコマンドの execute は再実行可能(決定的)であることが前提。
- **変更フラグの管理** `m_iModifyCountFromDoc`: 保存/新規作成時に0リセット。変更/Redoで+1、Undoで-1。`==0` のときのみ変更フラグOFF。「保存→Undo→新規編集」のように負の値から編集した場合は INT_MAX に飛ばして「二度と未変更状態に戻れない」ことを表す(ヘッダに詳細な仕様コメントあり)。
- `canUndo()`/`canRedo()` はスタックサイズで判定し、メニューの Undo/Redo の有効化(`OnUpdateEditUndo/Redo`)に使う。

### 4.4 `CRfEditCmdHolder`

`CRfEditCmdHolder.h`: `CObject` 派生の単純ラッパで、`Ou<CRfEditCmd> m_pCmd` を保持。MFC の `UpdateAllViews()` の `pHint`(`CObject*`)に**実行済みコマンドそのものを載せて全ビューへ配る**ためだけに存在する。各ビューの `OnUpdate()` は `IsKindOf(RUNTIME_CLASS(CRfEditCmdHolder))` で判定し、コマンドの種類・対象インデクスを見て**画面更新を最適化**(全再描画を避ける)する。

---

## 5. ビュー間の更新通知

1. どのビューで編集しても、最終的に `CDiagramEditDoc::executeEditCmd()` が呼ばれる。
2. `executeEditCmd()` → `CDiagramEditDoc::UpdateAllSubDocviews(pSender, lHint, pHint=CRfEditCmdHolder)`。
3. `CDiagramEditDoc::UpdateAllSubDocviews()`(`CDiagramEditDoc.cpp` 382-775行)は、まず**整合性検証**を行う:
   全 DocTemplate の全ドキュメントを列挙し、`CJikokuhyouDoc`/`CDedDiagramDoc`/`COperationTableDoc`/`CAllOperationTableDoc`/`CDedAllOperationTable2Doc`/駅時刻表系 それぞれについて、`getDiaName()` を `CentDedDiaCont::findCentDedDiaByName()` で照合し、**対応するダイヤが削除されていたらそのサブDocを `OnCloseDocument()` で閉じる**。運用系は加えて運用機能無効化(`getEnableOperation() < 2`)、運用番号消滅、パターンダイヤプレビュー化でも閉じる。
4. その後 `super::UpdateAllSubDocviews()`(`CHidemdiRootDoc`)がルート以外の全ドキュメントに `UpdateAllViews(pSender, lHint, pHint)` → 各ビューの `OnUpdate()` が呼ばれる。
5. 最後に `getCDlgRosenView()->OnUpdate(pSender, lHint, pHint)` を**明示的に**呼ぶ(左ペインは CView でないため。`CDiagramEditDoc.cpp` 774行)。
6. 各ビューの `OnUpdate` は `lHint == LHINT_SUBVIEW_TO_ROOTDOC(-1)` なら無視。それ以外は包含する `CWnd` 側の `OnUpdate` に委譲し、`pHint` のコマンド内容に応じて部分更新する。

つまり **単方向データフロー**(ビュー→コマンド→ルートDoc→全ビュー再描画)が既に成立しており、Redux/Flux 型の設計にそのまま対応付く。

---

## 6. DcDrawLib — 自前描画抽象ライブラリ

`libs/DcDrawLib/`。GDI を直接触るのはこの層だけで、上位は「プロパティ(単純データ)+描画部品(IfDcDraw)+描画先(IfDcdTarget)」で記述される。

### 6.1 座標系(`DcdCd/Pos/`)

- `DcdPos`/`DcdSize` = `int`(`DcdType.h`)。
- `CdDcdZone`(1次元: 起点+サイズ)、`CdDcdZoneXy`(矩形= X Zone + Y Zone)、`CdDcdPosXy`、`CdDcdSizeXy`。
- `CconvDcdPosOnZone`(2つの1次元座標系間の線形変換)、実装 `CconvDcdPosOnZone_DcdZone`/`_PosOrgAndRate`、XY版 `CconvDcdPosOnZoneXy`。
- `CconvContentPosToTarget(Xy)`: **コンテント座標(モデル座標)→ターゲット座標(描画先論理座標)** の変換器。「cm 単位の図形をウインドウの (10,10)-(190,190) に描く」ような、原点+倍率のマッピングを提供。ダイヤグラムのズーム・スクロールはこの仕組みの上にある。
- `CLineFunc`: 直線計算ユーティリティ。

### 6.2 描画先の抽象 `IfDcdTarget`(`DcDraw/`)

インターフェース(`IfDcdTarget.h`, 実装 `CDcdTarget.h`):

- `getHdc()` — Win32 デバイスコンテキスト(**唯一の Windows 依存点**)
- `getZone()` — 描画領域(論理単位)
- `getDrawableZone()` — 実際に再描画が必要な領域(WM_PAINT の invalid rect に相当。クリップ最適化用)
- `createGdiHFontHolder(CdFontProp)` / `createGdiHPenHolder(CdPenProp)` / `createGdiHBrushHolder(CdBrushProp)` — プロパティから GDI ハンドル生成

実装バリエーション:

| クラス | 用途 |
|---|---|
| `CDcdTargetOnPaint` | WM_PAINT(BeginPaint/EndPaint) |
| `CDcdTargetGetDC` | GetDC による随時描画 |
| `CDcdTargetCompatibleBitmap` | オフスクリーンビットマップ(ダブルバッファ) |
| `CDcdTargetPrinter` | プリンタDC |
| `CDcdTargetMfcPrintInfo`(`DcDrawMfc/`) | MFC の `OnPrint(CDC*, CPrintInfo*)` から生成。印刷/印刷プレビュー両対応。描画領域=`CPrintInfo::m_rectDraw`、1論理単位=プリンタ1ドット |
| `CaDcdTargetItemPosition` | 既存ターゲットの部分領域(余白適用等)へのアダプタ |
| `CaDcdTargetClip` | クリップ領域アダプタ |
| `CaDcdTargetZoomDisplay`(`DcDraw/Print/`) | 印刷ターゲットに**ディスプレイ相当の論理座標**を設定するアダプタ(ディスプレイDPI:プリンタDPI比でマッピングモード変更)。これにより画面用の描画コードがそのまま印刷に使える |

`CGdiCache`(`CGdiCache.h`): プロパティ(CdFontProp等)→GDIハンドルの対照表キャッシュ。ハンドル破棄責務を持つ。`CGdiHFontHolder/HPenHolder/HBrushHolder` は参照カウント付きホルダ。

### 6.3 描画部品の抽象 `IfDcDraw`

`IfDcDraw.h`:

```cpp
virtual bool DcDraw( IfDcdTarget* pIfDcdTarget ) = 0;                    // 描画実行
virtual bool getItemSize( IfDcdTarget*, CdDcdSizeXy* ) = 0;             // 自身のサイズ問い合わせ(レイアウト用)
```

実装(プリミティブ): `CDcdLine`(直線)、`CDcdFreeLine`(折れ線)、`CDcdRectangle`(枠)、`CDcdFillrect`/`CDcdFillrectRop`(塗り/ROP塗り)、`CDcdText`(文字列)、`CDcdTextbox`/`CDcdTextboxV3`(枠内テキスト)、`CVerticalTextElement(Builder)`(縦書きテキスト)。

### 6.4 描画プロパティ(`DcdCd/DcDrawProp/`)

デバイス非依存の単純データクラス群: `CdColorProp`(色)、`CdPenProp`(線種・太さ・色)、`CdBrushProp`、`CdFontProp`(フォント名・高さ。高さは Point/論理単位/セル高さ基準の3態が排他)、`CdDrawTextProp`/`CdDrawTextFormat`(整列等)、`CdDcdFreeLineProp`。`CconvDcDrawProp` が文字列との相互変換(ファイル保存用)を担う。**oud2 ファイル内のフォント・色設定はこの層の文字列表現**。

### 6.5 グリッド(`DcdGrid/`)

- `CDcdGrid`(`CDcdGrid.h`, IfDcDraw 実装): X列(`CDcdGridXColumn`)・Y列(`CDcdGridYColumn`)・罫線(`CDcdGridXBorder/YBorder`)・セル(`CDcdGridCell`)から成る表を任意ターゲットに描く。各セルは自身の `IfDcDraw`(デフォルト `CDcdTextbox`)を持つ。列幅・罫線太さは自動計算(`m_bAutoColumnSize`)か明示指定(多数列では明示推奨と注記)。
- `CaDcdGrid_PageSelector`: グリッドのページ分割選択(印刷用)。
- **`WndDcdGrid3/CWndDcdGrid`**: グリッドを表示する `CWnd` 派生の子ウインドウ。協調オブジェクトを集約:
  - `CXDcdGrid`(CDcdGrid 派生: コンテンツ+スクロール位置)
  - `CFocus`(フォーカスセル)
  - `CSelect`/`CSelectCell`(選択状態)
  - `CBoxSelect`(矩形選択操作)/`CRandomSelect`(Ctrl+クリックの個別選択)
  - `CPropStack`
  更新は `CWndDcdGrid::update()` が各集約オブジェクトへ `update_adjustProp()`/`update_updateScreen()` を委譲(例: フォーカス移動→自動スクロール)。部分再描画 API `InvalidateGrid()`/`InvalidateCell()`。
  時刻表・駅・運用表など**グリッド系ビューはすべてこのウインドウの派生**(`CWndJikokuhyou`, `CWndDcdGridOperationTable` 等)。

### 6.6 WinUtil

`CconvWinUser`(Win32 USER 系変換)、`CdScrollbarProp`(スクロールバー状態の単純データ)。

---

## 7. NsPropEditUi2 — プロパティ編集UIの基盤

`libs/OuLib/NsPropEditUi2/CPropEditUi2.h`。テンプレートクラス `CPropEditUi2<ARG_UIDATA>`。

- 3要素モデル: **Target**(編集対象のドメインオブジェクト)/**Ui**(CDialog 派生)/**UiData**(Ui の表示内容全体を保持する構造体。テンプレート引数)。
- クラスユーザーが実装する抽象メソッド:
  - Target⇔UiData: `UiDataFromTarget()`, `UiDataToTarget()`(+新規時初期化 `InitUiData()`)
  - Ui⇔UiData: `UiDataFromUi()`, `UiDataToUi()`
  - 正規化・検証: `AdjustUiData()`, `CheckUiData()`(不正時エラーメッセージ表示+`SetFocus()`)
- ライフサイクル:
  - `StartEdit()` = UiDataFromTarget → AdjustUiData → UiDataToUi(ダイアログの `OnInitDialog` から呼ぶ)
  - `OnUiChanged()` = UiDataFromUi → AdjustUiData → UiDataToUi(EN_KILLFOCUS / BN_CLICKED 毎に呼ぶ。**編集途中の正規化・連動項目更新**を実現)
  - `EndEdit()` = UiDataFromUi → AdjustUiData → UiDataToUi → CheckUiData(OK 押下時。検証NGならダイアログを閉じない)
- `m_bNewItem`(新規/既存編集の区別)、`m_pUiDataStartEdit`(開始時点コピー)、`m_pUiDataPrev`(前回正規化時点コピー: 差分検出用)、`m_bMethodProcessing`(UIイベント再入防止)。
- 利用箇所(`CPropEditUi2` を継承するクラス): `CPropEditUi_Eki`+`CDlgEkiProp`(駅)、`CPropEditUi_Ressya`+`CDlgRessyaProp`(列車)、`CPropEditUI_Ekijikoku`+`CDlgEkijikokuProp`(駅時刻)、`CPropEditUI_Operation`+`CDlgOperationProp`(作業)、`CPropEditUi_Ressyasyubetsu`+`CDlgRessyasyubetsuProp`(列車種別)、`CPropEditUi_CrossingCheckRule`+`CDlgCrossingCheckRule`。
- ダイアログ側の編集確定は最終的に `CRfEditCmd_*` を生成して `executeEditCmd()` に渡す(Undo 可能)。
- 補助: `OuMfc/OuDlg/CKeyinputSenderToModalDlg` — 親ウインドウでの文字キー押下を契機にモーダルダイアログを開き、その打鍵をダイアログのエディットに転送する(時刻表のセルで数字を打つと駅時刻ダイアログが開いて入力が継続する UX)。

---

## 8. 印刷機能

- **ページ設定**: `Print/CdPrintPageProp`(余白上下左右 mm、ヘッダ/フッタ印刷有無。`encode()/decode()` で `.ini` の `[AppProp]PrintPageProp` に永続化)。設定ダイアログ `Print/CDlgPrintPageProp`、mm→デバイス座標変換 `Print/CconvCdPrintPageProp`(`calcZoneInnerMargin(prop, printerHdc)`)。App が `m_CdPrintPageProp` を保持。
- **印刷パイプライン**(MFC標準に乗る): 各ビューが `OnPreparePrinting`(=`DoPreparePrinting`, 印刷ダイアログ)→ `OnBeginPrinting` → `OnPrepareDC` → `OnPrint` → `OnEndPrinting` を実装。
- `OnPrint` の典型フロー(`ViewJikokuhyou/CJikokuhyouView.cpp`):
  1. `CDcdTargetMfcPrintInfo aTarget(pDC, pInfo)` — プリンタ/プレビューDCを IfDcdTarget 化
  2. `CaDcdTargetItemPosition` + `CconvCdPrintPageProp::calcZoneInnerMargin()` で余白を除いた領域を作る
  3. `CaDcdTargetZoomDisplay` でディスプレイ相当の論理座標系に変換(**画面用描画コードをそのまま流用**)
  4. `CDcdText` でキャプション(路線名・ダイヤ名等)とページ番号を生成して描画
  5. グリッド/ダイヤグラムの IfDcDraw に `DcDraw(target)` させる。複数ページはグリッドの PageSelector で分割
- 印刷を実装しているビュー(`OnPreparePrinting` 実装で確認): 時刻表・ダイヤグラム・駅・駅時刻表・駅時刻表一覧・運用表・運用一覧表・運用一覧図・入出区連携コード一覧・交差支障チェック の10種。
- 印刷プレビューは MFC 標準(`OnSetPreviewMode` で左ペインを無効化するのが `CMainFrame` の役割)。

---

## 9. CSV変換機能

| クラス | 場所 | 内容 |
|---|---|---|
| `CconvJikokuhyouCsv` | `ConvJikokuhyouCsv/CconvJikokuhyouCsv.h` | 時刻表形式CSVへの**エクスポート(encode)専用**変換。実装メソッドは `encode` / `encode_AddRessya` / `encode_AddRessyaNull` / `encode_Ekijikoku` / `encode_BeforeOperation` / `encode_AfterOperation` のみで、クラスコメントには「取り込むこともできます」とあるが decode(インポート)系メソッドは未実装。アプリ内の利用箇所もエクスポートのみ(`ViewJikokuhyou/CDlgOuJikokuhyouCsvExport.cpp`)。外部時刻表の取り込みは別機構 `CDlgDigitalJikokuhyouImport`(`CMainFrame.cpp` の `OnFileDigitalJikokuhyoufileImport_Process`)が担う。「下り」「上り」「列車番号」「列車種別」「列車名」「号数」「備考」「着」「発」「レ」「‖」「番線」「運用番号」「始発駅作業」「前作業」「後作業」等の固定見出し文字列をメンバに持つ。駅時刻の文字列化 `encode_Ekijikoku()` は駅扱(停車/通過/経由なし)+秒表示+コロン+2400表記+秒丸めを引数で制御。通過で時刻を持つ場合は末尾に "?" を付ける |
| `CconvJikokuhyouCustomizeCsv` | 同ディレクトリ | カスタマイズ時刻表(表示列仕様 `CdYColSpecCont` に基づく)のCSV出力 |
| `CconvOperationTableCsv` | `ViewOperationTable/CconvOperationTableCsv.h` | 運用表のCSV変換 |
| `CconvEkiJikokuhyouCsv` | `ViewEkiJikokuhyou/CconvEkiJikokuhyouCsv.h` | 駅時刻表のCSV変換 |
| `CconvAllOperationTableCsv` | `ViewAllOperationTable/CconvAllOperationTableCsv.h` | 運用一覧表のCSV変換 |

CSV基盤は `libs/OuLib/Str/CsvDocument/CdCsvDocument`。生成は `CDiagramEditApp::createCconvJikokuhyouCsv()` 等のファクトリ経由。

---

## 10. ユーティリティ基盤(OuLib / OuMfc)

### OuLib

- **NsOu**(`NsOu/Ou.h` ほか): `Ou<T>` = 参照カウント式スマートポインタ(`OuBase`+`OuHolder<T>`)。`OuNew`, `OuStatic`, `dynamic_castOu` あり。コマンドやセル描画部品の共有に全面使用。Web では GC があるため**そのまま消える概念**。
- **NsMu**(`NsMu/NsMu.h`): 配列コンテナ抽象。`Mu`(読み取り)/`Mui`(挿入・削除可)/`Mup` インターフェースと、実装 `CMup_deque/CMup_vector/CMup_list`、コピー格納 `CMuiCopied(Parent)`、多態格納 `CMuiOu(Parent)`、アダプタ `CaMuiSelect`(部分選択ビュー — 選択列車のみ編集に使用)、`CaMuiFilter`、`CConvTable`。ヘッダ自身に「作りすぎの傾向がある」と注記あり。ドメイン層(`CentDedXxxCont`)がこの上に構築されている。Web では配列+ヘルパで置換可能。
- **Str**: `tstring`、`strprintf`、`stringSplit`、`strtoint`、`CdFilenameStr`(パス分解)、`strToWstr`、`vectorToFile.cpp` の `stringFromFile`(UTF-8 BOM 自動判定/SJIS フォールバック)・`stringToFile`(UTF-8 BOM 付き書き込み)・`stringToFileANSI`(SJIS書き込み)、`CsvDocument`、**`OuPropertiesText`**(`CNodeContainer`/`CConvNodeContainer` — .oud2 の「Key=Value+ブロック」形式テキストのノードツリー表現とエンコーダ/デコーダ)。
- **Dir**: `mkdirs` 等。**logmsg**: レベル付きファイルログ(`logmsg_setFilename`, `logmsg_setLogLevel`, `LogMsg()` マクロが全域に散在)。

### OuMfc

- **Hidemdi**: §2 の通り。
- **FrameLeftPane**: `CWndSplitBarV`(左ペイン/MDIClient 間の縦スプリッタ)。
- **TreeCtrl**: `CaTreeCtrl`(HTREEITEM⇔アイテムロケーション変換・子列挙のアダプタ)、`CTreeCtrlContextMenu`。路線ビューのツリーで使用。
- **MfcUtil**: 文字列リソース読み出し等の小物。
- **OuDlg**: `CKeyinputSenderToModalDlg`(§7)。

---

## 11. Web 再実装に向けた論点

### 11.1 そのまま移せる(移すべき)設計

- **単一ルートストア+コマンドパターン**: `CDedRosenFileData` を単一の状態ツリーとし、変更は `CRfEditCmd` 相当の直列化可能なコマンドオブジェクトのみが行う、という規律は Redux/zustand 等にほぼ1:1で写せる。Undo=逆コマンド生成(inverse patch)、Redo=元コマンド再実行、という現行方式は immer の patches/inversePatches でも自然に実装できる。
- **変更フラグの ModifyCount 方式**(0で未変更、負から編集で INT_MAX)は仕様ごと持ち込む価値がある(保存後Undoの「*」表示問題を正しく扱っている)。
- **hint 付き更新通知**: `pHint` にコマンドを渡して各ビューが部分更新する仕組みは、ストア購読のセレクタ/差分検知に対応。コマンド種別ごとの影響範囲メタデータとして設計し直すとよい。
- **PropEditUi2 の3要素モデル**(Target/UiData/Ui + Start/Changed/End + Adjust/Check)は、フォーム状態(draft state)+正規化+バリデーションを持つフォームコンポーネントの仕様書としてそのまま読める。
- **CconvContentPosToTarget の座標変換モデル**(コンテント座標→描画先論理座標の原点+倍率マッピング)は Canvas の transform(または自前の変換関数)へ素直に対応。

### 11.2 Windows/MFC 依存で置き換えが必要なもの

| 現行 | Web での置き換え候補 |
|---|---|
| MDI 子ウインドウ(CMDIChildWnd)+Hidemdi | タブ/分割ペイン/フローティングパネル(golden-layout 等)。「同一 DocStr は単一インスタンス」規則(`CHidemdiDoctmplDocstrAlone`)は維持 |
| DocTemplate/RUNTIME_CLASS による動的生成 | ビュー種別→コンポーネントのレジストリ(単純な map) |
| `OnCmdMsg` のコマンドルーティング連鎖(View→Wnd→Doc→App) | コマンドディスパッチャ+アクティブビューコンテキスト。メニュー/ショートカットの有効判定(OnUpdateXxx)も一元化 |
| GDI (HDC/HFONT/HPEN/HBRUSH), CGdiCache | Canvas 2D API。`CdFontProp/CdPenProp/CdBrushProp` は ctx.font/strokeStyle 等へ直接マップでき、ハンドルキャッシュは不要 |
| `IfDcdTarget` 実装群(OnPaint/CompatibleBitmap/Printer) | 画面=Canvas、ダブルバッファ=OffscreenCanvas(またはブラウザ任せ)、印刷=印刷用レイアウト or PDF 生成。`getDrawableZone` のダーティ矩形最適化は要不要を再評価 |
| `CWndDcdGrid`(グリッド+フォーカス+選択+スクロール) | 仮想化グリッドを Canvas で自前描画(現行同様)か、DOM グリッド。フォーカス/矩形選択/個別選択/キーボードナビは仕様として移植 |
| MFC 印刷パイプライン+`CaDcdTargetZoomDisplay` | CSS print / PDF。「画面と同じ描画コードで印刷する」思想は、Canvas→PDF(または print 用再レンダリング)で再現 |
| クリップボード独自フォーマット(RegisterClipboardFormat) | `navigator.clipboard` + カスタム MIME(または JSON テキスト)。アプリ内コピー&ペーストはストア内バッファでも可 |
| `.ini`(PrivateProfile)によるビュー表示設定・MRU | localStorage / IndexedDB |
| `HtmlHelp()`(.chm) | HTML マニュアルへのリンク(原本 `DiagramEdit/manual/oudia_manual/` が HTML なので流用可) |
| `IfProgress`+`CDlgProgress` | 非同期処理+進捗UI(中断フラグの仕様は同じ) |
| logmsg のファイルログ | console/構造化ログ |

### 11.3 注意すべき仕様・難所

- **文字コード**: 読み込みは UTF-8(BOM) と Shift-JIS の両対応が必須(`stringFromFile` は BOM で判定)。`.oud` 保存は Shift-JIS。ブラウザでは TextDecoder("shift_jis") で読めるが、**Shift-JIS の書き出しはエンコーダ自作または ライブラリが必要**(TextEncoder は UTF-8 のみ)。
- **サブビューの同一性がダイヤ「名」ベース**(`findCentDedDiaByName`): ダイヤ名変更・削除時にビューを強制クローズする現仕様は、Web では安定IDの導入で単純化できる(ただしファイル形式にはIDがないため、ロード時に付与する)。
- **ウインドウ配置(`WindowPlacement`/`ChildWindow`)がデータファイル内に保存される**。互換性のため読み書きは実装しつつ、アプリ状態とドキュメント状態は内部では分離すべき。
- **Undo 深さが 8 固定**で浅い。コマンドが旧データを丸ごと保持する設計(列車コンテナのコピー等)のためメモリ配慮と思われる。Web では深さを増やせるが、コマンドのデータ量(全列車置換など)に注意。
- **Redo=再実行**なのでコマンドは決定的でなければならない。運用探索(`m_bWaitOperationConnect` 関連)のような副次計算が絡む箇所は要検証。
- `UpdateAllSubDocviews` 内の運用系ドキュメントの整合性チェックは条件が複雑(運用機能レベル `getEnableOperation()`、パターンダイヤプレビュー、運用番号存在)。Web ではビュー有効条件を宣言的に(セレクタで)書き直すのが得策。
- `CDiagramEditApp` の open 系ファサードが返すのは Doc と最初の View。**1つのサブDocに複数ビュー**は Hidemdi 上可能だが、実運用は DocstrAlone により1ドキュメント1ウインドウ。
- 自動バックアップは「編集コマンド実行時に60秒間隔」でトリガされる(タイマーではない)。

### 11.4 単純化できる点

- `Ou<T>`/`Mu` 系スマートポインタ・コンテナ抽象は GC と配列で消滅。`CaMuiSelect`(選択部分ビュー)は「選択インデクス集合を引数に取る」だけの関数に落ちる。
- `CGdiCache`、GDI ハンドルホルダ、`CDcdTargetCompatibleBitmap` は不要。
- Hidemdi の Doc テンプレート機構は「開いているビューのリスト + 種別 + パラメータ(旧DocStr)」を持つ UI ストアで置換できる。
- ルートDoc の非表示フレーム/ビュー(`CHidemdiRootFrame/RootView`)は MFC の都合の産物で、概念ごと不要。
