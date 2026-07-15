# 用語集

OuDia / OuDiaSecond の鉄道・ダイヤ用語と、元ソース(C++)識別子、Web 版(TypeScript)で使う識別子の対応表。

- **元ソース識別子**: `origin/` 配下のクラス名・enum・oud2 ファイルのキー/ノード名。出典は `docs/analysis/02_domain-model.md` と `08_manual-features.md` §8。
- **Web 版識別子(提案)**: `docs/design/02_architecture.md` の方針(ローマ字ドメイン語彙を維持、INT_MIN → `null`、駅作業は判別可能ユニオン)に整合する命名。パッケージ間で共通に使う。
- 原典の綴り(`Brunch` = branch の誤記、`Soater` = sorter の誤記等)は、**oud2 ファイルキーと一致するものはあえて踏襲する**(互換検証のしやすさを優先)。ファイルに現れない処理名は正しい綴りに直す。

---

## 1. 基本エンティティ

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 路線ファイルデータ | `CDedRosenFileData`、oud2 ルート | `RosenFileData` | .oud2 ファイル 1 個分の全データ。ストアが保持する唯一のドキュメント状態 |
| 路線 | `Rosen` / `CentDedRosen`、ノード `Rosen.` | `Rosen` | エンティティツリーのルート。1 ファイル = 1 路線。駅列・種別・ダイヤ群を保持 |
| 駅 | `Eki` / `CentDedEki`、ノード `Eki.` | `Eki`(配列 `ekiCont`) | 駅名・駅時刻形式・駅規模・番線等。配列の出現順 = 駅 Index |
| 列車種別 | `Ressyasyubetsu` / `CentDedRessyasyubetsu` | `Ressyasyubetsu`(配列 `ressyasyubetsuCont`、コマンド名では `syubetsu`) | 種別名・略称・文字色・線スタイル・停車駅明示。列車から index 参照される |
| ダイヤ | `Dia` / `CentDedDia` | `Dia`(配列 `diaCont`) | 「平日」「土休日」等。名前は路線内で一意。下り/上りの列車コンテナを持つ |
| 列車 | `Ressya` / `CentDedRessya` | `Ressya`(`ressyaCont: [Ressya[], Ressya[]]`) | 列車番号・種別 index・列車名・号数・備考・駅時刻列。`[0]`=下り `[1]`=上り |
| 駅時刻 | `EkiJikoku` / `CentDedEkiJikoku` | `EkiJikoku`(配列 `ekiJikokuCont`) | 1 列車 × 1 駅の駅扱 + 着発時刻 + 番線 + 前後作業。**要素数は常に駅数と一致** |
| コメント | `Comment` / `ViewComment` | `comment: string` | 路線ファイルに付随する自由テキスト |
| 列車方向(下り/上り) | `ERessyahoukou`: `Ressyahoukou_Kudari(0)` / `_Nobori(1)` | `Houkou = 0 \| 1`(0=下り、1=上り) | ファイル・コンテナ添え字と同じ数値をそのまま型にする |
| 列車番号 | `m_strRessyabangou` / `Ressyabangou` | `ressyabangou` | 一本化・運用の同定キーにも使われる文字列 |
| 列車名・号数 | `m_strRessyamei` / `m_strGousuu` | `ressyamei` / `gousuu` | 愛称と号数(「のぞみ」「1」) |
| 備考 | `Bikou` / `m_strBikou` | `bikou` | 時刻表最下段の縦書きテキスト |
| 空行列車(Null 列車) | `m_bIsNull` | `isNull` | 時刻表ビューの空列。全駅時刻が運行なしでも Null |
| 運休扱い | `m_bIsCanceled` | `isCanceled` | Ver2.06.15。灰色表示・運用/交差支障の対象外 |
| 親種別 | `m_iParentSyubetsuIndex` | `parentSyubetsuIndex: number \| null` | 表示上の集約用親種別(OuDiaSecond 拡張)。-1(OFF)は `null` に |
| 隠し種別 | `m_bHidden` | `hidden` | カスタマイズ時刻表・駅時刻表で非表示にする種別 |
| 駅規模 | `EEkikibo`: `Ekikibo_Ippan` / `_Syuyou` | `Ekikibo = 'ippan' \| 'syuyou'` | 一般駅/主要駅。主要駅はダイヤグラム横罫線が太線 |
| 駅時刻形式 | `EEkijikokukeisiki`: `Jikokukeisiki_Hatsu / Hatsuchaku / KudariChaku / NoboriChaku / KudariHatsuchaku / NoboriHatsuchaku` | `Ekijikokukeisiki = 'hatsu' \| 'hatsuchaku' \| 'kudariChaku' \| 'noboriChaku' \| 'kudariHatsuchaku' \| 'noboriHatsuchaku'` | 時刻表にどの時刻欄(着/発)を出すか。後 2 つは OuDiaSecond 拡張 |
| 駅扱(えきあつかい) | `EEkiatsukai`: `Ekiatsukai_None / _Teisya / _Tsuuka`(`_Keiyunasi` は Ver2.01 で削除) | `Ekiatsukai = 'none' \| 'teisya' \| 'tsuuka'` | 運行なし/停車/通過。「経由なし」は enum でなく分岐・環状設定で表現 |
| 駅名略称 | `m_strEkimeiJikokuhyouRyaku` / `m_strEkimeiDiagramRyaku` | `ekimeiJikokuhyouRyaku` / `ekimeiDiagramRyaku` | 時刻表用・ダイヤグラム用の短縮駅名 |
| 境界線(旧) | `m_bKyoukaisen` / `Kyoukaisen` | `kyoukaisen`(読込互換のみ) | 本家 OuDia の支線区切り。Ver1.02 で分岐駅設定に置換。.oud 読込/書出の変換にのみ使用 |

## 2. インデックス体系・時刻

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 駅 Index | 駅Index(`CentDedRessya.h` コメント) | `ekiIndex` | **路線基準**の駅番号。下り始発駅 = 0。`ekiCont` の添え字 |
| 駅 Order | 駅Order、`EkiOrderOfEkiIndex()` | `ekiOrder`(変換 `ekiIndexOfEkiOrder()` / `ekiOrderOfEkiIndex()`) | **列車方向基準**の駅番号。上下とも始発駅 = 0。`ekiJikokuCont` の添え字。上りは `駅数-1-ekiIndex` |
| 時刻 Order | `CdDedJikokuOrder`(`m_iEkiOrder` + `EEkiJikokuItem`) | `JikokuOrder`(`ekiOrder * 2 + (0=着 \| 1=発)`) | 列車内の特定時刻(着 or 発)を指す順序数。0〜駅数×2-1 |
| 列車参照キー | `CdDedRessyaProperty` | `RessyaRef = { houkou, ressyaIndex }` | 方向 + 列車 Index の軽量ハンドル。運用探索のキー |
| 時刻 | `CdDedJikoku`(秒、`INT_MIN` = Null) | `Seconds = number & { __brand }`、未設定は `null` | 0〜86399 の秒。日付なし・24h サイクリック(25:00 は 1:00 として保持) |
| 時間(経過時間) | `CdDedJikan` | `DurationSeconds = number` | 符号付き秒。Null なし |
| 起点時刻 | `m_jikokuKitenJikoku` / `KitenJikoku` | `kitenJikoku` | ダイヤグラム左端の時刻。**循環比較の基準**(起点時刻を最小とみなす)。Null 不可 |
| 循環比較 | `CdDedJikoku::compare(value, kitenJikoku)` | `compareJikoku(a, b, kitenJikoku)` | 起点 5:00 なら 5:00 < 23:59 < 0:00 < 4:59。ソート・運用接続の全基盤 |
| 時刻差 | `subJikoku()` | `subJikoku(a, b)` | 2 時刻の差を「絶対値 12 時間以下の側」で返す(1:00 − 23:00 = +2h) |
| 秒丸め・2400 表示 | `ESecondRound` / `m_bDisplay2400` | `SecondRound = 'down' \| 'round' \| 'up'` / `display2400` | 表示用の着発別秒丸めと 0:00 着の「2400」表記 |

## 3. 番線・分岐・路線外

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 番線 | `Track` / `CentDedEkiTrack2`、ノード `EkiTrack2` | `EkiTrack2`(配列 `ekiTrack2Cont`) | 駅の着発線。名称・略称・上り略称。OuDiaSecond Ver1.02 拡張 |
| 列車番線 | `m_iRessyaTrackIndex`(`INT_MIN` = 未設定) | `ressyaTrackIndex: number \| null` | 駅時刻が持つ、その駅の番線コンテナへの index |
| 主本線 | `m_iDownMain` / `m_iUpMain`、キー `DownMain` / `UpMain` | `downMain` / `upMain` | 下り/上りの既定番線 index。範囲外 index の読込補正先でもある |
| 在線表 | `RessyaTrackLine` / `CentDedDgrRessyaTrackLine` | `RessyaTrackLine` | ダイヤグラム上に駅の番線ごとの在線を横帯で表示する機能 |
| 分岐駅 | `Brunch`: `m_iBrunchCoreEkiIndex` / `m_bBrunchOpposite`、`adjustBrunchLoop*` | `brunchCoreEkiIndex: number \| null` / `brunchOpposite`(綴りは原典踏襲) | 支線を「同名駅を駅リストに複数回登場させる」ことで表現。基幹駅の駅 Index を指す |
| 環状線 | `Loop`: `m_iLoopOriginEkiIndex` / `m_bLoopOpposite` | `loopOriginEkiIndex: number \| null` / `loopOpposite` | 環状運転の起点駅指定。分岐と合わせ `BrunchLoopPosition` 派生マップを再計算 |
| 反転駅 | `Opposite`(`m_bBrunchOpposite` / `m_bLoopOpposite`) | 同上 | スイッチバック等で列車の向きが反転する駅の設定 |
| 路線外発着(路線外始発・終着) | `OuterTerminal`(構造体)、キー `OuterTerminal` | `OuterTerminal`(配列 `outerTerminalCont`) | 路線範囲外の始発・終着駅を駅名文字列で保持。Ver1.04 拡張 |
| 次駅までの距離 | `m_iNextEkiDistance` | `nextEkiDistance`(秒、0 = 既定値使用) | ダイヤグラム駅間幅の手動指定(秒単位) |

## 4. 運用(車両運用)

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 運用 | `Operation` / `CDedOperationConnecter` | `operation`(探索は `connectOperations()`、derive パッケージ) | 車両の行路。前後作業と番線から自動接続される |
| 運用機能モード | `m_iEnableOperation`(0/1/2) | `enableOperation: 0 \| 1 \| 2` | 0=無効 / 1=簡易(接続のみ)/ 2=通常(運用番号割当) |
| 運用番号 | `OperationNumber`(`m_strOperationNumber1/2/3`) | `operationNumbers: string[]` | 連結編成 1 本ごとに 1 運用番号。段数設定あり |
| 前作業 | `CentDedBeforeOperation`(`EBOperation`) | `BeforeOperation`(判別可能ユニオン、下記 `kind`) | 駅時刻の着前に行う作業のリスト(時系列順) |
| 後作業 | `CentDedAfterOperation`(`EAOperation`) | `AfterOperation`(同上) | 駅時刻の発後に行う作業のリスト |
| 入換 | `BOperation_Shunt` / `AOperation_Shunt` | `kind: 'shunt'` | 番線間の車両移動。入換前番線・入換着発時刻を持つ |
| 増結 | `BOperation_Connect` | `kind: 'connect'`(相手編成の作業を入れ子保持) | 編成の連結。前後どちらに繋ぐかのフラグあり |
| 解結 | `BOperation_Release` | `kind: 'release'` | 編成の切り離し。解結編成の後作業を入れ子保持 |
| 出区 / 入区 | `BOperation_Out` / `AOperation_In` | `kind: 'out'` / `kind: 'in'` | 車庫からの出庫/入庫。運用探索の起点/終点 |
| 路線外始発 / 路線外終着 | `BOperation_Outer` / `AOperation_Outer` | `kind: 'outerStart'` / `kind: 'outerEnd'` | 路線外発着駅からの始発/への終着 |
| 前列車接続 / 次列車接続 | `BOperation_Junction` / `AOperation_Junction` | `kind: 'junction'` | 折り返し等での前後列車の接続。次列車接続タイプ(別列車/種別変更/列車情報変更/同一列車扱い)を持つ |
| 運用番号変更 | `BOperation_NumberChange` / `AOperation_NumberChange` | `kind: 'numberChange'` | 途中駅での運番付け替え |
| 接続種別 | `EBeforeAfterType`(`_Unrelated / _ClassChange / _PropertyChange / _PropertySame / _OutIn / _Outer / _OperationNumberChange`) | `BeforeAfterType` 文字列ユニオン | 運用表に表示される接続の種類(導出値) |
| 入出区連携コード | `InOutLinkCode` / `InOutLinkCodeContent` | `inOutLinkCode` / `InOutLinkCodeContent`(導出キャッシュ) | 車両基地との出入りを別路線ファイルと連携させるコード。同一コードで入区 → 出区へ運番引継ぎ |
| 運用表 / 運用一覧 / 運用一覧図 | `ViewOperationTable` / `ViewAllOperationTable` / `ViewAllOperationTable2`、`OperationTableContent` | `OperationTableContent`(導出キャッシュ)、ビュー種別 `operationTable` / `allOperationTable` / `allOperationChart` | 運用番号ごとの行路表 / 全運用の一覧表 / 図形式表示 |
| 箱ダイヤ | (運用表の表示モード、Ver2.04.01) | `hakoDiagram`(運用表レンダラのモード) | 運用を箱形に図示する伝統的表現 |
| 基準運転時分 | `StdOpeTime`(`StdOpeTimeFunc`)、`m_iKijunDiaIndex` | `stdOpeTime` / `kijunDiaIndex` | 種別ごとの標準所要時間。基準ダイヤから取得し差分表示・「合わせる」コマンドに使う |
| 交差支障チェック | `CrossingCheck` / `CrossingCheckRule`、`ViewCrossingCheck` | `CrossingCheckRule`(配列 `crossingCheckRuleCont`)、判定は derive の `checkCrossing()` | 駅構内の進路競合検査。前後動作の番線指定と時隔上限/下限(`iHeadwaySecond(Minimum)` → `headwaySecond` / `headwaySecondMinimum`)|
| 時隔 | `iHeadwaySecond` | `headwaySecond` | 2 つの動作の時間間隔(秒)。「下限 <= 間隔 < 上限」で支障と判定 |

## 5. ビュー・表示・ダイヤグラム描画

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 時刻表(ビュー) | `Jikokuhyou` / `ViewJikokuhyou`、`CCellBuilder` | ビュー種別 `jikokuhyou`、セル生成は `cellSpec()` 純関数 | 下り/上り別の列車時刻表グリッド。編集の主戦場 |
| カスタマイズ時刻表 | `CustomizeJikokuhyou` / `CustomizeJikokuhyouContent` | ビュー記述子の `customizeFlag`、列構成 `CustomizeJikokuhyouContent`(導出キャッシュ) | 市販時刻表風の表示モード。列構成は運用探索の導出結果 |
| 駅時刻表 | `EkiJikokuhyou` / `ViewEkiJikokuhyou` | ビュー種別 `ekiJikokuhyou` | 駅掲示風の方面別発車時刻表 |
| ダイヤグラム | `Diagram` / `ViewDiagram`、`entDgr/CentDedDgr*` | ビュー種別 `diagram`、レイアウトは `computeDiagramLayout(rosen, diaIndex): DiagramLayout` | 横軸 = 時刻・縦軸 = 駅の列車運行図表 |
| スジ(列車線) | `Ressyasen` / `CentDedDgrRessyasen`、`CRessyaDraw` | `Ressyasen`(`DiagramLayout` 内の折れ線) | ダイヤグラム上の列車 1 本の線。停車駅・補間ズレ 60 秒超で折れ線分割 |
| ダイヤグラムエンティティ座標 | DgrX(秒)/ DgrY(秒) | `dgrX` / `dgrY` | X = 午前 0 時からの経過秒(負・86400 超を許容)、Y = 駅間幅(秒) |
| 駅間最小所要秒数 | `m_iEkikanSaisyouSecKudari/Nobori`(entDgr) | `ekikanSaisyouSec`(derive で算出) | 各駅停車の最速所要時間。ダイヤグラム駅間縦幅の基礎値。ビューを開いた時と[更新]時のみ再計算する遅延仕様 |
| 停車駅明示 | `EStopMarkDrawType` | `StopMarkDrawType = 'drawOnStop' \| 'nothing'` | 短時間停車駅にスジ上の ○ 印を付ける種別設定 |
| 線スタイル | `CdDiagramLineStyle`(`ESenStyle`: 実線/破線/点線/一点鎖線、太線) | `DiagramLineStyle`(`senStyle: 'jissen' \| 'hasen' \| 'tensen' \| 'ittensasen'`, `isBold`) | 種別ごとのスジの描画スタイル |
| 時刻表記号 | 「ﾚ」(通過)「\|\|」(経由なし)「・・」(運行なし)「----」(主要駅運行なし)「○」(時刻なし停車)「====」(終着後) | `CellSpec.symbol` | セルに描く記号。書式忠実度が Canvas グリッド採用理由の一つ |
| 路線ビュー | `ViewRosen`(`CRosenViewTreeCtrl`) | 左ペインの路線ツリー(React) | 路線/駅/種別/ダイヤ/各ビューのランチャー |
| ビュー記述子 | DocStr(「ダイヤ名\n方向\nフラグ」)、`CHidemdiDoctmplDocstrAlone` | `ViewDescriptor = { type, diaName, houkou, customizeFlag }` | タブの同一性キー。二重オープン防止・ダイヤ削除時の自動クローズに使う |

## 6. 編集操作・コマンド

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| 編集コマンド | `CRfEditCmd_*`(Eki/Ressya/Ressyasyubetsu/Dia/…)、`executeEditCmd()` | `EditCommand`(`'ressya/replaceRange'` 等の名前付きコマンド)+ `executeCommand()` | ドキュメント変更の単一チョークポイント。Undo は Immer 逆パッチ(原典の `createUndoCmd()` 逆コマンドは廃止) |
| 元に戻す/やり直し | Undo / Redo(`m_contUndo` / `m_contRedo`) | `undo()` / `redo()`(`HistoryEntry { command, patches, inversePatches }`) | patch 方式。深さ既定 100 |
| 変更カウンタ | `m_iModifyCountFromDoc` | `modifyCount` | 保存 0 / 変更 +1 / Undo −1 / 負から編集で INT_MAX。「保存後 Undo → 編集」の未保存判定 |
| 整合カスケード | `onEkiInsert/onEkiErase`、`adjustBrunchLoop*`、種別 index シフト | domain の `cascade*` 関数群(draft Rosen への一連の adjust) | 駅・種別・番線の増減時に全列車の駅時刻数・参照 index を追従させる処理 |
| 連続入力モード | (Ctrl+T、マニュアル 2.3 章) | `continuousInputMode` | 分 2 桁のみの連続タイプで始発 → 終着へ時刻を入力するモード |
| 繰上げ/繰下げ | (駅時刻ダイアログのトグル) | `propagateShift` | 途中駅の時刻変更で以後の全駅時刻を同量シフト |
| 時の補完 | (分のみ入力で時を補完) | `completeHour` | 前駅時刻から ±1 時間以内で時を推定 |
| 連続 1 分修正 | (Ctrl+J/K/L 系 6 コマンド) | `adjustMinuteAndNext` 系コマンド | ±1 分修正してフォーカスを次列車へ移す高速修正 |
| 駅時刻変更(一括)と再実行 | `CentDedRessya_EkijikokuModifyOperation2`、ピリオドキー | `EkijikokuModifyOperation` + `repeatLastModify` | 変更内容(駅扱変更・n 分シフト・他駅コピー)を定義し多数列車へ連続適用 |
| 貼り付け移動量 | (時刻表ビューのプロパティ、秒対応) | `pasteShiftSeconds` | 貼り付けごとに加算される時刻シフト量。パターンダイヤ量産に使う |
| 直通化 / 分断 | `direct` / (当駅止り・当駅始発) | コマンド `ressya/direct` / `ressya/split` | 2 列車の結合 / 1 列車の 2 分割 |
| 一本化 | `CRessyaContUnifier` | `unifyRessya()`(domain) | 列車番号非空一致 + 種別一致 + 発着連続の列車を全自動結合 |
| 並べ替え | `CDedRessyaSoater_*`(Ekiatsukai/Ressyabangou/Ressyamei/Ressyasyubetsu/Bikou/OperationNumber/RessyaTrack/Transfer) | `sortRessya(criteria)`(domain。綴りは sorter に修正) | 駅扱/停車駅時刻(乗継考慮)/種別/備考等によるソート |
| 箱型選択 / ランダム選択 | `CBoxSelect` / `CRandomSelect`(CWndDcdGrid) | `BoxSelection` / `RandomSelection`(render グリッド基盤) | Shift+移動の矩形選択 / Ctrl+クリックの個別選択 |
| 路線ファイルの組入れ / 切り出し | (メニュー機能) | `mergeRosenFile()` / `extractRosenFile()` | 別ファイルの併合 / 指定駅間のみの切り出し(範囲外を路線外発着化するオプション) |
| プロパティ編集ライフサイクル | `CPropEditUi2`(StartEdit / OnUiChanged / EndEdit) | `usePropEdit` フック | ダイアログの 開始→正規化→検証確定 の 3 段階 |

## 7. ファイル形式・I/O

| 日本語用語 | 元ソース識別子 | Web 版識別子(提案) | 意味 |
|---|---|---|---|
| oud2 形式 | `FileType=OuDiaSecond.1.17`、`CconvCDedRosenFileData` | `@oudia/format` の `parseOud2()` / `serializeOud2()` | UTF-8(BOM 付き)+CRLF の `Key=Value` + ノード階層テキスト |
| oud 形式 | `FileType=OuDia.1.02`、`CconvCDedRosenFileDataOud` | `parseOud()` / `serializeOud()` | 本家 OuDia 形式(Shift_JIS)。読込 + 機能喪失警告付き書き出し |
| OuPropertiesText | `OuPropertiesText` / `CNodeContainer` | `PropertiesNode`(パーサ/ノードツリー) | ノード開始 `名前.`・終端 `.`・プロパティ `Key=Value` の独自文法 |
| 世代別リーダー | `CconvCentDedS00 / S05 / S09` | `readerS00 / readerS05 / readerS09 / readerCurrent` | 旧世代 oud2(1.00–1.16)・OuDia 1.02 の読込変換系統 |
| 寛容読込規則 | (非数→0、範囲外 index→主本線補正、0x5C 救済) | format 内の正規化関数群 | 原典で開けるファイルは必ず開けるようにする読込時補正 |
| ウインドウ配置 | `WindowPlacement` / `ChildWindow` ノード | 未解釈保持(`unknownNodes` と同機構) | Windows 版の MDI 配置。読込時保持・書出時透過書き戻しのみ |
| CSV 変換 | `CconvJikokuhyouCsv` / `CconvJikokuhyouCustomizeCsv` / `CconvOperationTableCsv` / `CconvEkiJikokuhyouCsv` | `jikokuhyouCsv` 等(format 内) | 時刻表(双方向)・カスタマイズ時刻表・運用表・駅時刻表の CSV |
| 自動バックアップ | `iBackupIntervalSecond = 60` | OPFS 世代保存(編集コマンド契機・60 秒) | タイマーではなく編集契機。クラッシュ復元の元データ |

---

## 補足: 命名規約

1. **ドメイン語彙はローマ字を維持する**(`Eki`, `Ressya`, `Dia`, `Jikoku`, …)。英訳(Station, Train)にしない。理由: (a) oud2 ファイルキー・原典ソースとの対応が一目で分かり互換検証が容易、(b) 「駅扱」「駅時刻形式」等は英訳すると原語との対応が失われる。
2. **接尾辞 `Cont`**(コンテナ)は原典・ファイルキーの慣習に合わせ配列プロパティ名に維持する(`ekiCont`, `diaCont`)。
3. **enum は数値でなく文字列ユニオン**にする(`'teisya'` 等)。ただしファイル上の数値との変換表は format 層に持つ。例外は列車方向 `Houkou = 0 | 1`(配列添え字と同一視するため数値のまま)。
4. **Null 表現**: 原典の `INT_MIN` / `-1` センチネルは TypeScript では `null` に統一する。ファイルとの変換は format 層で行う。
5. **原典の誤記綴り**(`Brunch`, `Kyoukaisen` 等)は oud2 ファイルキーに現れるものに限り踏襲し、コメントで `[sic]` を付す。ファイルに現れない処理名(`Soater` → sorter)は正しい綴りに直す。
