# OuDiaSecond ファイル形式仕様 (.oud2 / .oud)

対象: OuDiaSecond ver 2.06.23 のソースコード解析に基づく `.oud2`(現行) / `.oud`(OuDia互換) 路線ファイル形式の仕様書。
特記なき限りすべてソースで確認した事実であり、推測箇所は【推測】と明記する。

主な根拠ソース (origin/ からの相対パス):

| 役割 | ファイル |
|---|---|
| ファイル全体の読み書き・FileType判定 | `DiagramEdit/DiagramEdit/DedRosenFileData/CconvCDedRosenFileData.{h,cpp}` |
| 行文法 (パーサ/シリアライザ) | `libs/OuLib/Str/OuPropertiesText/CConvNodeContainer.cpp` (+ `CNode/CDirectory/CPropertyString/CNodeContainer`) |
| Rosen配下の変換 (現行 1.10–1.17) | `DiagramEdit/DiagramEdit/entDed/CconvCentDed.cpp` (5083行) |
| DispProp の変換 | `DiagramEdit/DiagramEdit/DedRosenFileData/CconvCdDedDispProp.cpp` / `CdDedDispProp.{h,cpp}` |
| 旧版読込 (1.06–1.09) | `DiagramEdit/DiagramEdit/entDed/CconvCentDedS09.cpp` |
| 旧版読込 (1.01–1.05) | `DiagramEdit/DiagramEdit/entDed/CconvCentDedS05.cpp` |
| 旧版読込 (1.00 / OuDia.1.02) | `DiagramEdit/DiagramEdit/entDed/CconvCentDedS00.cpp` |
| .oud 書き出し | `DiagramEdit/DiagramEdit/DedRosenFileData/CconvCDedRosenFileDataOud.cpp` + `entDed/CconvCentDedOud.cpp` |
| ファイルI/O・文字コード | `libs/OuLib/Str/vectorToFile.cpp` (`stringToFile` / `stringToFileANSI` / `stringFromFile`) |
| ドキュメント開閉 (エントリポイント) | `DiagramEdit/DiagramEdit/CDiagramEditDoc.cpp` (`OnOpenDocument` / `OnSaveDocument`) |
| 時刻文字列 | `DiagramEdit/DiagramEdit/entDed/CdDedJikoku.{h,cpp}` |
| 色・フォント文字列 | `libs/DcDrawLib/DcdCd/DcDrawProp/CconvDcDrawProp.cpp` |
| バージョン履歴 | `OuDiaSecond変更箇所.txt` |
| 実サンプル | `DiagramEdit/manual/sample2.oud2` (FileType=OuDiaSecond.1.17, UTF-8 BOM, CRLF) |

---

## 1. 物理形式(文字コード・改行・BOM)

読み書きは MFC の Doc/View だが Serialize は使わず、ファイル全体を1つの文字列として読み書きする
(`CDiagramEditDoc::OnOpenDocument` / `OnSaveDocument`)。

### 書き出し
- **.oud2 (および .oud2backup)**: `stringToFile()` → `_tfopen_s(..., _T("w , ccs=UTF-8"))`。
  MSVC のこのモードは **UTF-8 + BOM(EF BB BF)** で書き、テキストモードのため改行は **CRLF**。
  sample2.oud2 の実バイト列で BOM・CRLF を確認済み。
- **.oud**: `stringToFileANSI()` → `"wt"` + `stringOf()`(ワイド→ANSI変換) = **Shift-JIS (CP932)、BOMなし、CRLF**。

### 読み込み (`stringFromFile`, vectorToFile.cpp)
1. まず ANSI テキストモードで先頭を読み、**UTF-8 BOM (EF BB BF) があれば UTF-8**(`"r, ccs=UTF-8"` で読み直し)、
   **なければ Shift-JIS** として読む。拡張子では判定しない。
2. Shift-JIS 読込時の特殊処理: 「―ソЫⅨ噂浬欺圭構蚕十申曾箪貼能表暴予禄兔喀媾彌拿杤歃濬畚秉綵臀藹觸軆鐔饅鷭偆砡纊犾」
   (Shift-JIS で2バイト目が 0x5C の文字群)の**直後にある `\` を1文字削除**する救済処理がある
   (壊れた旧ファイル対策)。
3. ファイル中に `\0` があるとエラー -3(バイナリとみなす)。
4. テキストモード読込のため、メモリ上の文字列では CR は除去され **行区切りは LF** になる。
   パーサ(`getLine`)は `\n` のみを行区切りとして扱う。**Web実装では CR を明示的に除去する必要がある**。

### FileTypeAppComment
保存時、ノード変換の最後に `FileTypeAppComment=<AppName> Ver. <version>`
(例: `FileTypeAppComment=OuDiaSecondV2 Ver. 2.06.21`) をルート直下に追加する。トップレベル挿入順の関係で
**ファイル最終行**に現れる。読込では解釈されず、読込エラー時のメッセージ表示
(「新しいアプリで作られたファイル」の案内)にのみ使う。定義は `CDiagramEditDoc.h:98`。

---

## 2. 行文法 (OuPropertiesText)

ファイル全体は「ノードコンテナ」のテキスト表現。ノードは2種類:
**CPropertyString**(Key=Value 行) と **CDirectory**(名前付き子コンテナ)。

### デコード規則 (`CConvNodeContainer::decodeNodeContainer`)
行を上から順に処理する。
1. **空行** → 読み飛ばす。
2. **`.` のみの行** → 現在のディレクトリの終端。
3. **`=` を含まず、末尾が `.` の行** → ディレクトリ開始。名前 = 行から末尾の `.` を除いた文字列。
   以降を再帰的に子コンテナとして解釈し、対応する `.` 行で閉じる。
   対応する `.` がないまま EOF に達した場合、**通常はエラーにならない**(そのディレクトリの
   子として EOF まで読んで受理される)。エラー -2 ("Container Is Not Closed") になるのは
   ディレクトリ開始行がファイル末尾で、以降に1文字も残っていない場合
   (子の `decodeNodeContainer` が「開始位置が既にコンテンツ末尾」で 0 を返した場合)のみ。
   互換実装ではこの「閉じ忘れディレクトリの受理」挙動を再現する必要がある。
4. **それ以外** → プロパティ行。最初の `=` の前が名前、後がエスケープ解除した値。
   `=` がない行は「名前のみ・値は空」のプロパティになる(エラーにならない)。
5. トップレベル解釈終了後にまだ文字が残っている(トップレベルに `.` が現れた)場合、
   エラー -1 ("Container Aborted" / ディレクトリが途中で閉じています)。

### エンコード規則 (`CConvNodeContainer::encode`)
- プロパティ: `名前=エスケープ済み値` + LF (実ファイルでは CRLF)。
- ディレクトリ: `名前.` 行 + 子の再帰エンコード + `.` 行。
- ノードの**出現順序は保存され、意味を持つ**(後述の同名複数キー)。

### 値のエスケープ (`encodePropertyString_escapePropertyValue` / `decode...unescape...`)
| 元 | 書き出し | 読込 |
|---|---|---|
| 改行 LF | `\n` (バックスラッシュ+n) | `\n` → LF |
| `\` | `\\` | `\\` → `\` |
| `.` | エスケープしない(そのまま) | `\.` はそのまま `\.` の2文字として保持 |
| その他の `\x` | ― | そのまま2文字保持(先読みで消費) |

- 名前側はエスケープされない。値に `=` が含まれても最初の `=` で分割するので問題ない。
- 複数行文字列(Rosen の Comment、Bikou 等)は `\n` エスケープで1行に収まる。

### 同名キーの繰り返し
同じ名前のプロパティ/ディレクトリが同一コンテナ内に複数並ぶことがあり、`getInName(name, idx)` /
`sizeInName(name)` で n 番目を取得する。例: `Eki.`×駅数、`Ressya.`×列車数、
`JikokuhyouFont=`×8、`DiaBackColor=`×5、`JikokuhyouBackColor=`×4、`OuterTerminal.`×n、
`CrossingCheckRule.`×n。

---

## 3. FileType とバージョン判定

ルート直下の `FileType` プロパティで判定 (`CconvCDedRosenFileData::isEncodeAbleFormat`)。
書き出し時の現行値は **`OuDiaSecond.1.17`** (`CconvCDedRosenFileData.h getFileType()`)。

| 判定グループ | FileType 値 | 読込に使う変換クラス |
|---|---|---|
| 5 (現行) | OuDiaSecond.1.10 〜 1.17 | `CconvCentDed` |
| 4 | OuDiaSecond.1.06 〜 1.09 | `CconvCentDedS09` |
| 3 | OuDiaSecond.1.01 〜 1.05 | `CconvCentDedS05` |
| 2 | OuDiaSecond.1.00 | `CconvCentDedS00` |
| 1 | OuDia.1.02 | `CconvCentDedS00` |
| それ以外 | ― | エラー -1 (FileType が正しくありません) |

すなわち**マイナー版内は前方互換読み(新キーは無視ではなく「省略時デフォルト」で吸収)**、
グループ境界では専用リーダーで旧構造→新構造へ変換する方式。
書き出しは常に最新 FileType のみ(旧版形式での保存は .oud のみ)。

### FileType とアプリ版の対応 (OuDiaSecond変更箇所.txt / CconvCDedRosenFileData.h の日付コメントより)

| FileType | 導入アプリ版 | 主な追加(ファイル形式上) |
|---|---|---|
| 1.00 | 初版 (2017) | OuDia.1.02 に EkiTrack2Cont・DownMain/UpMain・Brunch/Loop 等を追加 |
| 1.01/1.02 | Ver1.01〜 | FileType 命名変更、.oud 書き出し用 FileType 追加 |
| 1.03 | Ver1.02.90β〜1.03 | DisplayRessyamei、JikokuhyouRessyaWidth拡大 |
| 1.04 | Ver1.04 | 路線外発着 (OuterTerminal)、Kudari/NoboriDiaAlias、上り番線略称 |
| 1.05 | Ver1.04.04 | NextEkiDistance、JikokuhyouTrackOmit |
| 1.06/1.07 | Ver2.00〜2.02 | 運用機能導入(Operation・EnableOperation)、経由なし廃止、番線のEkiJikoku統合 |
| 1.08 | Ver2.02.03 | SecondRoundChaku/Hatsu、Display2400 |
| 1.09 | Ver2.03 | OperationTableFont等のフォント/色、駅名略称(Ekimei*Ryaku) |
| 1.10 | Ver2.05 | 駅作業パラメータ改訂(入出区連携コード InOutLinkCode)、OperationNumberRows、OperationCrossKitenJikoku、JikokuhyouOuterDisplay* |
| 1.11 | Ver2.06 | CrossingCheckRule (平面交差支障チェック) |
| 1.12 | Ver2.06.02 | WindowPlacement ノード |
| 1.13 | Ver2.06.05 | HeadwaySecondMinimum、運用番号順反転(NumberChange作業の空運番) |
| 1.14 | Ver2.06.07 | KijunDiaIndex (基準運転時分ダイヤ) |
| 1.15 | Ver2.06.15 | Canceled (運休)、Hidden/DisableHiddenSyubetsu (隠し種別) |
| 1.16 | Ver2.06.18 | PatternDiagramPreviewEnable/CycleSecond |
| 1.17 | Ver2.06.21〜(現行2.06.23) | JikokuhyouNyuusenJikokuDisplay*、JikokuhyouPrevSyubetsuChangeDisplay* (入線時刻・前列車情報欄) |

---

## 4. ノード階層の全体像

```
(root)
├ FileType=OuDiaSecond.1.17            … 必須・先頭
├ Rosen.                               … 必須 (無いと -2)
│ ├ Rosenmei= / KudariDiaAlias= / NoboriDiaAlias=
│ ├ Eki.        ×駅数 (路線の起点→終点順)
│ │ ├ (駅プロパティ多数 … §5.2)
│ │ ├ EkiTrack2Cont.
│ │ │ └ EkiTrack2. ×番線数 { TrackName= / TrackRyakusyou= / TrackNoboriRyakusyou= }
│ │ ├ OuterTerminal. ×n { OuterTerminalEkimei= / OuterTerminalJikokuRyaku= / OuterTerminalDiaRyaku= }
│ │ └ CrossingCheckRule. ×n (§5.4)
│ ├ Ressyasyubetsu. ×種別数 (§5.5)
│ ├ Dia.        ×ダイヤ数
│ │ ├ DiaName= ほか (§5.6)
│ │ ├ Kudari.
│ │ │ └ Ressya. ×列車数 (§5.7)
│ │ └ Nobori.
│ │   └ Ressya. ×列車数
│ ├ KitenJikoku= / DiagramDgrYZahyouKyoriDefault= / EnableOperation= /
│ │ OperationNumberReverse= / OperationCrossKitenJikoku= / KijunDiaIndex= /
│ │ DisableHiddenSyubetsu= / Comment=
├ DispProp.                            … 必須 (無いと -3) (§5.8)
├ WindowPlacement.                     … 任意 (1.12〜) (§5.9)
└ FileTypeAppComment=…                 … 書き出しのみ・最終行
```

インデックス参照の規約: 種別・番線・駅・ダイヤはすべて**出現順の0起点インデックス**で相互参照する
(`Syubetsu=4`、`ParentSyubetsuIndex`、`DownMain/UpMain`、`BrunchCoreEkiIndex`、`KijunDiaIndex`、
EkiJikoku の `$番線` 等)。名前参照は使われない。

---

## 5. 各ノードのプロパティ仕様(現行 FileType 1.10–1.17)

表の「省略時」は読込時のデフォルト。「条件付き出力」は書き出し時にその条件でのみ出力されることを示す
(条件を満たさない場合キー自体が出ない)。bool は文字列 `"1"`/`"0"`(読込は多くが `=="1"` 判定)。
表中の「err -nn」は各エンティティの `From_OuPropertiesText` が返す**局所コード**である。ユーザ可視の
最終コードは呼び出し階層でオフセットが加算される(§8): Ressyasyubetsu 系 -100 / Dia 系 -200
(CconvCentDed.cpp の `iRv = iResult - 100` / `- 200`)、さらに `from_OuPropertiesText` 系全体に -1000
(CconvCDedRosenFileData.cpp)。例: §5.5 Syubetsumei の局所 -11 → -111 → 最終 **-1111**。

### 5.1 Rosen (CconvCentDed::CentDedRosen_To/From_OuPropertiesText)

書き出し順: Rosenmei → KudariDiaAlias → NoboriDiaAlias → Eki× → Ressyasyubetsu× → Dia× →
KitenJikoku → DiagramDgrYZahyouKyoriDefault → EnableOperation → OperationNumberReverse →
OperationCrossKitenJikoku → KijunDiaIndex → DisableHiddenSyubetsu → Comment。

| キー | 型 | 意味 | 省略時 / 備考 |
|---|---|---|---|
| Rosenmei | 文字列 | 路線名 | 空可。常に出力 |
| KudariDiaAlias / NoboriDiaAlias | 文字列 | 「下り」「上り」の別名 | 空可。常に出力 |
| KitenJikoku | 時刻(§6.1) | ダイヤグラム起点時刻 | 空→Null時刻。不正なら err -352 |
| DiagramDgrYZahyouKyoriDefault | int | 既定の駅間幅(ダイヤ表示秒) | 60。負なら err -353 |
| EnableOperation | int | 運用機能 0=無効 / 1=簡易(接続のみ) / 2=通常 (`CentDedRosen.h` コメント) | 0。書き出しは >0 のみ |
| OperationNumberReverse | bool | 運用番号順反転 | false。true時のみ出力 |
| OperationCrossKitenJikoku | bool | 起点時刻跨ぎ運用接続 | false。true時のみ出力 |
| KijunDiaIndex | int | 基準運転時分ダイヤの index | 省略時は DiaName=="基準運転時分" のダイヤを検索、なければ 0 |
| DisableHiddenSyubetsu | bool | 隠し種別を強制表示 | false。true時のみ出力 |
| Comment | 文字列(複数行) | 路線コメント | `\n` エスケープで1行化。常に出力 |

読込後処理: `adjustBrunchLoopCont()`(分岐/環状の整合)、`adjustOperation()`、
`adjustCrossingCheckRuleByEkiEdit()`、全ダイヤに `OperationConnect()`(運用接続の解決)。

### 5.2 Eki (CentDedEki_To/From_OuPropertiesText)

| キー | 型 | 意味 | 省略時 / 出力条件 |
|---|---|---|---|
| Ekimei | 文字列 | 駅名 | 常に出力(空可) |
| EkimeiJikokuRyaku | 文字列 | 時刻表用略称 | 空なら出力しない |
| EkimeiDiaRyaku | 文字列 | ダイヤ用略称 | 空なら出力しない |
| Ekijikokukeisiki | 列挙 | 駅時刻形式 | 必須。不正で err -22。値: `Jikokukeisiki_Hatsu` / `Jikokukeisiki_Hatsuchaku` / `Jikokukeisiki_KudariChaku` / `Jikokukeisiki_NoboriChaku` / `Jikokukeisiki_KudariHatsuchaku` / `Jikokukeisiki_NoboriHatsuchaku` |
| Ekikibo | 列挙 | 駅規模 `Ekikibo_Ippan` / `Ekikibo_Syuyou` | 必須。不正で err -32 |
| DiagramRessyajouhouHyoujiKudari / …Nobori | 列挙 | ダイヤ列車情報表示。`DiagramRessyajouhouHyouji_Anytime` / `_Not`。既定値(Origin)は**空文字にマップされキー自体を出力しない** | Origin。不正で err -41/-42 |
| DownMain / UpMain | int | 下り/上り主本線の番線 index | intOf("")=0。常に出力 |
| BrunchCoreEkiIndex | int | 分岐元駅 index | -1(分岐なし)。>=0 のみ出力 |
| BrunchOpposite | bool | 分岐が反対方向 | false。Brunch有かつtrue時のみ `1` |
| LoopOriginEkiIndex | int | 環状線の起点駅 index | -1。>=0 のみ出力 |
| LoopOpposite | bool | 環状が反対方向 | false |
| JikokuhyouTrackDisplayKudari / …Nobori | bool | 時刻表の発番線表示 | false。true時のみ `1` |
| DiagramTrackDisplay | bool | ダイヤの番線表示 | false。true時のみ `1` |
| DiagramTrackOmit | `0/1` のカンマ列 | 番線ごとのダイヤ省略 | 常に出力(番線数分)。不足分は false |
| EkiTrack2Cont. | dir | 番線一覧 (§5.3) | 読込で存在しない場合: デフォルト2番線を維持し DownMain=0 / UpMain=1 に補正(テキストペースト対応) |
| OuterTerminal. ×n | dir | 路線外発着駅 | Ekimei 空のエントリは無視 |
| NextEkiDistance | int | 次駅までの所要距離(表示用) | 0。デフォルト(未設定)時は出力しない |
| JikokuhyouTrackOmit | bool | 番線編集モードの番線欄省略 | false。true時のみ `1` |
| JikokuhyouOperationOrigin / …Terminal | int 1–3 | 時刻表の始発/終着運用欄 | 0(なし)。>0のみ出力。範囲外→0 |
| JikokuhyouOperationOriginDownBeforeUpAfter / …DownAfterUpBefore | bool | 運用欄の前後配置 | false。true時のみ `1`。対応する Origin/Terminal>0 のときのみ読込 |
| JikokuhyouOperationTerminalDownBeforeUpAfter / …DownAfterUpBefore | bool | 同上(終着側) | 同上 |
| JikokuhyouJikokuDisplayKudari / …Nobori | `着,発` (各0/1) | 時刻表の着/発時刻表示 | 各1。範囲外・非数→1 |
| JikokuhyouSyubetsuChangeDisplayKudari / …Nobori | `a,b,c,d,e` | 種別変更/次列車情報欄: a=列車番号(0–3), b=運用番号(0–4), c=列車種別(0–3), d=列車名(0–3), e=運用番号段数(1–5) | 0,0,0,0,1 |
| JikokuhyouPrevSyubetsuChangeDisplayKudari / …Nobori | 同上5値 | 前列車情報欄 (1.17〜) | 0,0,0,0,1 |
| JikokuhyouNyuusenJikokuDisplayKudari / …Nobori | bool | 入線時刻欄 (1.17〜) | false。true時のみ `1` |
| DiagramColorNextEki | int | 次駅間のダイヤ背景色 index (DiaBackColor 0–4) | 0。常に出力 |
| OperationTableDisplayJikoku | bool | 運用表に時刻表示 | false。true時のみ `1` |
| JikokuhyouOuterDisplayKudari / …Nobori | `始発,終着` (各0/1) | 路線外始発/終着欄表示 | 0,0 |
| CrossingCheckRule. ×n | dir | 平面交差支障ルール (§5.4) | なし可 |

### 5.3 EkiTrack2 (番線)

| キー | 型 | 意味 | 備考 |
|---|---|---|---|
| TrackName | 文字列 | 番線名 | 必須(空で err -11) |
| TrackRyakusyou | 文字列 | 略称(下り) | 必須(空で err -21) |
| TrackNoboriRyakusyou | 文字列 | 上り略称 | 空なら出力しない。省略時は空 |

### 5.4 CrossingCheckRule (1.11〜)

| キー | 型 | 意味 | 省略時 |
|---|---|---|---|
| Caption | 文字列 | ルール名 | 空だと内部コード -1(ただし読込失敗にはならない。下記注) |
| Enable | bool | 有効 | `!="0"` 判定 → 省略時 true |
| HeadwaySecond | int | 時隔秒 | 60 |
| HeadwaySecondMinimum | int | 時隔下限秒 (1.13〜) | 0。HeadwaySecond 以上なら 0 に補正 |
| BeforeFromTrackContentCont / BeforeToTrackContentCont / AfterFromTrackContentCont / AfterToTrackContentCont | `type$index` を `;` で連結 | 対象トラック集合。type は `ETrackType`: 0=駅番線(index=番線idx), 1=起点側(index=駅idx), 2=終点側(index=駅idx), 3=路線外(index=OuterEkiIdx) (`CentDedEki.h:162`) | 空だと内部コード -2〜-5(読込失敗にはならない。下記注) |
| BeforeIsArrival / BeforeIsTsuuka / AfterIsArrival / AfterIsTsuuka | bool | 着基準/通過 | false |

注(読込時のエラー挙動): `CrossingCheckRule_From_OuPropertiesText` (CconvCentDed.cpp) は関数末尾が
`return 0;` 固定で、内部エラーコード -1〜-5 は呼び出し元に伝播しない(iRv<0 の場合は
`*pCrossingCheckRule` への代入がスキップされるだけ)。呼び出し元 `CentDedEki_From_OuPropertiesText`
は戻り値 0 を受けて**デフォルト構築のままの CrossingCheckRule を addCrossingCheckRule() する**ため、
Caption 空や TrackContent 空の不正ルールは「既定値のルールに置き換わって読込成功」となる
(`COuErrorInfoContainer` への情報追加は Caption 空の場合のみ)。書き出し側
(`CrossingCheckRule_To_OuPropertiesText`) のエラーは Caption 空の -1 のみで、
TrackContentCont が空でも空値のキーが出力されるだけでエラーにならない。

### 5.5 Ressyasyubetsu (列車種別)

| キー | 型 | 意味 | 省略時 / 出力条件 |
|---|---|---|---|
| Syubetsumei | 文字列 | 種別名 | 必須(空で err -11) |
| Ryakusyou | 文字列 | 略称 | 空なら出力しない |
| JikokuhyouMojiColor | 色(§6.3) | 時刻表文字色 | 常に出力 |
| JikokuhyouFontIndex | int 0–7 | 時刻表フォント index | 常に出力。読込は範囲外で err -101 |
| JikokuhyouBackColor | 色 | 時刻表背景色 | 常に出力。読込は空なら既定のまま |
| DiagramSenColor | 色 | ダイヤ線色 | 常に出力 |
| DiagramSenStyle | 列挙 | `SenStyle_Jissen`(実線) / `SenStyle_Hasen`(破線) / `SenStyle_Tensen`(点線) / `SenStyle_Ittensasen`(一点鎖線) | 必須。不正で err -52 |
| DiagramSenIsBold | bool | 太線 | false。true時のみ `1` |
| StopMarkDrawType | 列挙 | `EStopMarkDrawType_DrawOnStop`(既定) / `_Nothing` / `_DrawOnPass` | DrawOnStop |
| ParentSyubetsuIndex | int | 親種別 index | -1。>=0 のみ出力 |
| Hidden | bool | 隠し種別 (1.15〜) | false。true時のみ `1` |

(`DiagramRessyaFont` は名前定数のみ存在し現行では未出力。)

### 5.6 Dia (ダイヤ)

| キー | 型 | 意味 | 省略時 |
|---|---|---|---|
| DiaName | 文字列 | ダイヤ名 | 必須(空で err -11) |
| MainBackColorIndex / SubBackColorIndex | int | 背景色 index (DispProp.DiaBackColor 0–4) | 既定値のまま(空なら未設定) |
| BackPatternIndex | int | 背景パターン | 同上 |
| PatternDiagramPreviewEnable | bool | パターンダイヤプレビュー (1.16〜) | false。true時のみ `1` |
| PatternDiagramPreviewCycleSecond | int | プレビュー周期秒 | 600 |
| Kudari. / Nobori. | dir | 各方向の列車コンテナ。**両方必須**(欠けると err -12 RessyaContが見つかりません) | ― |

### 5.7 Ressya (列車)

書き出し順: Houkou, Syubetsu, Ressyabangou, Ressyamei, Gousuu, EkiJikoku, Operation…, Bikou, Canceled。

| キー | 型 | 意味 | 省略時 / 出力条件 |
|---|---|---|---|
| Houkou | `Kudari` / `Nobori` | 列車方向 | 解釈不能なら他のキーは一切読まれず、`createNullRessya()` で生成した **Null 列車(空列)としてコンテナに挿入される**(エラーにしない)。Null 列車は書き出し時に中身のない空の `Ressya.` ノードとして出力され、ラウンドトリップで保持される |
| Syubetsu | int | 種別 index | `_ttoi` (非数→0) |
| Ressyabangou | 文字列 | 列車番号 | 空なら出力しない |
| Ressyamei | 文字列 | 列車名 | 同上 |
| Gousuu | 文字列 | 号数 | 同上 |
| EkiJikoku | §6.2 のカンマ連結 | 駅ごとの発着時刻・駅扱・番線。**駅0(方向別の先頭駅)から終着駅まで**。始発前は空要素(`,,`)、終着より後は出力しない | 空なら時刻なし |
| Operation{path} | §6.4 | 駅作業(前作業 B / 後作業 A)。空でない作業列がある駅の分だけ出力 | なし |
| Bikou | 文字列 | 備考 | 空なら出力しない |
| Canceled | bool | 運休 (1.15〜) | false。true時のみ `1` |

読込時、駅ごとの番線数・主本線・路線外発着数のベクタ(下り順/上り順に並べ替えた駅列)を使って
範囲チェックする。上り列車の EkiJikoku は**上り方向の駅順**(終点→起点)で並ぶ。
`#pragma omp parallel for ordered` で列車読込は並列化されている(順序は ordered で維持)。

### 5.8 DispProp (CconvCdDedDispProp)

すべて常に出力される(コメントに「デフォルト値の場合は出力しません」とあるが実装は常時出力)。
読込側は空/欠落を許容し既定値を使う。既定値は `CdDedDispProp.cpp` コンストラクタより。

| キー | 型 | 意味 | 既定値 |
|---|---|---|---|
| JikokuhyouFont ×8 | フォント(§6.5) | 時刻表フォント8スロット(idx1=Bold, idx2=Itaric, idx3=Bold+Itaric) | 9pt Meiryo UI |
| JikokuhyouVFont | フォント | 縦書きフォント | 9pt @メイリオ |
| DiaEkimeiFont / DiaJikokuFont / DiaRessyaFont | フォント | ダイヤ駅名/時刻/列車 | 9pt Meiryo UI |
| OperationTableFont / AllOperationTableJikokuFont | フォント | 運用表 (1.09〜) | 9pt / 8pt Meiryo UI |
| CommentFont | フォント | コメント欄 | 9pt Meiryo UI |
| DiaMojiColor | 色 | ダイヤ文字色 | 黒 |
| DiaBackColor ×5 | 色 | ダイヤ背景色5スロット (1.09〜) | 白×5 |
| DiaRessyaColor | 色 | (廃止予定と注記あり)ダイヤ列車色 | 黒 |
| DiaJikuColor | 色 | ダイヤ軸色 | C0C0C0 |
| JikokuhyouBackColor ×4 | 色 | 時刻表背景4スロット | 白/F0F0F0/白/白 |
| StdOpeTime{Lower,Higher,Undef,Illegal}Color | 色 | 基準運転時分比較色 | FFE0E0 / E0FFFF / FFFF80 / A0A0A0 |
| OperationStringColor / OperationGridColor | 色 | 運用表文字/罫線 | 黒 |
| EkimeiLength | int | 駅名欄幅(全角数) | 6 (>0のみ採用) |
| JikokuhyouRessyaWidth | int | 列車欄幅 | 5 (>0のみ採用) |
| AnySecondIncDec1 / AnySecondIncDec2 | int | 任意秒送りボタン1/2 | 5 / 15 (>=-60のみ採用) |
| DisplayRessyamei | bool | 列車名表示 | true (`=="0"` のみ false) |
| DisplayOuterTerminalEkimeiOriginSide / …TerminalSide | bool | 路線外発着欄(起点/終点側) | false |
| DiagramDisplayOuterTerminal | int | ダイヤの路線外発着表示 | 0 |
| SecondRoundChaku / SecondRoundHatsu | int | 秒処理 0=切捨 1=丸め 2=切上 (`CdDedJikoku::CConv::ESecondRound`) | 0 / 0 |
| Display2400 | bool | 0:00着を24:00表記 | false |
| OperationNumberRows | int | 運用番号段数 (1.10〜) | 1 |
| DisplayInOutLinkCode | bool | 入出区連携コード欄 (1.10〜) | false |

### 5.9 WindowPlacement (1.12〜, 任意)

読込は ini 設定 `WindowPlacementRestore` 有効時のみ反映。

| キー | 意味 |
|---|---|
| RosenViewWidth | 路線ビュー幅 px |
| ChildWindow. ×n | 子ウィンドウ1つ: `WindowType`(0=下り時刻表,1=上り時刻表,2=ダイヤ,3=下りカスタマイズ時刻表,4=上りカスタマイズ時刻表,5=運用表,6=運用一覧図), `DiaIndex`, `XPos`, `YPos`, `XSize`, `YSize` |

---

## 6. 値のミニフォーマット

### 6.1 時刻文字列 (CdDedJikoku)

ファイル書き出し用の共通フォーマッタ `g_CdDedJikokuConv` は
`(NoColon=true, EHour_ZeroToNone, ESecond_NotIfZero)` (CconvCentDed.cpp:110)。

- **書き出し**: `時`(先頭ゼロなし1〜2桁) + `分`(2桁) + [`秒`(2桁, 0秒なら省略)]。コロンなし。
  例: 4:59:00→`459`、4:59:30→`45930`、0:00→`000`、13:15→`1315`。Null時刻→空文字列。
- **読み込み** (`CdDedJikoku::decode`): 空→Null。コロンが無ければ末尾から2桁ずつ区切って挿入
  (`131545`→`13:15:45`、`915`→`9:15`)。秒がなければ `:00` 補完、時が1桁なら `0` 補完、
  先頭スペースは `0` 扱い。範囲は 0≤時<24, 0≤分<60, 0≤秒<60。範囲外はエラー(-2)。
- 内部表現は 0:00 からの通算秒 (0 ≤ s < 86400)。日付・24時超の概念はなし(設定時にmod正規化)。

### 6.2 駅時刻 (EkiJikoku 1要素)

書式(現行): `駅扱[;着時刻/発時刻][$番線Index]`

- **駅扱 (EEkiatsukai)**: 0/空=運行なし、`1`=停車、`2`=通過。運行なしのときは要素全体が空文字列。
  旧OuDiaの `3`(経由なし)は Ver2.00 で廃止され、読込時 0..2 の範囲外は 0 に落とす。
- **書き出しロジック** (`CentDedEkiJikoku_To_string`):
  - 駅扱≠None のとき駅扱数字を出力。
  - 着 or 発時刻が非Nullなら `;` に続けて出力。着時刻が非Nullなら `着/` を先に書き、続けて発時刻
    (発がNullなら空。つまり着のみは `1;033/` の形、発のみは `1;035` の形)。
  - 駅扱≠None なら常に `$番線Index` を最後に付加。
- **読み込みロジック** (`CentDedEkiJikoku_From_string`): 最初の `;` で駅扱と時刻部を分離。
  時刻部に `/` があれば前=着・後=発、なければ全体=発。さらに `$` 以降が番線。
  `;` がない場合も `$` があれば駅扱+番線と解釈。番線が範囲外(0未満 or 番線数以上)なら
  その駅・方向の主本線(下り=DownMain, 上り=UpMain)に置換。
- 例(sample2.oud2): `1;012/013$2`(停車 着0:12 発0:13 3番目の番線)、`2$0`(通過・番線0)、
  `1;033/$3`(停車 着0:33 発なし)、空要素 `,,` = 未経由区間。

### 6.3 色

`%08X` の8桁大文字16進。**下位から R, G, B**(Win32 COLORREF: `0x00BBGGRR`)。
例: `00FFFFFF`=白、`00FAEAE2`= R=0xE2,G=0xEA,B=0xFA。上位バイトは常に 00。
(`CconvDcDrawProp::CdColorProp_to_string`)

### 6.4 駅作業 (Operation)

運用機能(EnableOperation>0)で使う前作業(Before)・後作業(After)のエンコード。

- **キー名**: `Operation` + パス。パスは `"{駅Order}B"`(その駅の前作業列)または `"{駅Order}A"`(後作業列)。
  増結(Connect)・解結(Release)作業は入れ子の作業列を持ち、そのキーは
  `親パス + "." + 親内の作業index + "B"|"A"`。例: `Operation13B`, `Operation13B.0A`, `Operation32A`。
  駅Order は EkiJikoku と同じ「その列車方向での駅番号」。
- **値**: 作業をカンマで連結。各作業は先頭に種類番号、その後 `/` `$` `/` `$` `/` を**この順の区切り**で
  最大5パラメータ (p1$〜p5)。区切り文字は交互に現れる固定順で、パラメータの意味は種類ごとに異なる。

**前作業 (CentDedBeforeOperation::EBOperation)**

| 種類 | 意味 | 書式 |
|---|---|---|
| 0 | 入換 (Shunt) | `0/入換元番線idx$入換発時刻/[入換着時刻]$着時刻表示(0|1)` |
| 1 | 増結 (Connect) | `1/前方に連結(0|1)$連結時刻` + 子Before作業列(`…{idx}B`) |
| 2 | 解結 (Release) | `2/解結位置$解結両数/解結時刻` + 子After作業列(`…{idx}A`) |
| 3 | 出区 (Out) | `3/出区時刻$入出区連携コード/元運用番号(;連結)` |
| 4 | 路線外始発 (Outer) | `4/路線外始発駅idx$始発時刻/当駅着時刻$入出区連携コード/元運用番号(;連結)` |
| 5 | 前列車接続 (Junction) | `5/起点時刻$仮運用番号(;連結)` |
| 6 | 運用番号変更 (NumberChange) | `6/運用番号(;連結)`。**運番が空 = 運用番号順反転が有効** (1.13〜) |

**後作業 (CentDedAfterOperation::EAOperation)**

| 種類 | 意味 | 書式 |
|---|---|---|
| 0 | 入換 | `0/入換先番線idx$入換発時刻/[入換着時刻]$発時刻表示(0|1)` |
| 1 | 増結 | `1/前方に連結(0|1)$連結時刻` + 子Before作業列 |
| 2 | 解結 | `2/解結位置$解結両数/解結時刻` + 子After作業列 |
| 3 | 入区 (In) | `3/入区時刻$入出区連携コード` |
| 4 | 路線外終着 | `4/路線外終着駅idx$当駅発時刻/終着時刻$入出区連携コード` |
| 5 | 次列車接続 | `5/終点時刻$次列車接続タイプ(0-3: 0=接続なし?/列車情報変更/種別変更等)` |
| 6 | 運用番号変更 | `6/運用番号(;連結)` (空=順反転) |

読込時の補正: 番線idx・路線外駅idx が範囲外なら 0、次列車接続タイプ範囲外なら 0。
運用番号は `;` 区切りで複数(併結編成分)持てる。

### 6.5 フォント

`CdConnectedString2` 形式 = `項目=値` を `;` で連結。
項目: `PointTextHeight`, `LogicalunitTextHeight`, `LogicalunitCellHeight`, `Facename`,
`Bold`(1), `Itaric`(1, 綴りは原文ママ), `Underline`, `StrikeOut`, `Escapement`。
bool系・0値は省略される。例: `PointTextHeight=10;Facename=Meiryo UI;Bold=1;Itaric=1`。
(`libs/DcDrawLib/DcdCd/DcDrawProp/CconvDcDrawProp.cpp`)

---

## 7. 旧バージョン読込 (後方互換) の要点

### 7.1 S00: OuDia.1.02 / OuDiaSecond.1.00 (CconvCentDedS00.cpp)
- Eki: `Kyoukaisen`(境界線) を読み、**分岐駅設定の推定に利用**(現行モデルに境界線は存在しない)。
  EkiTrack2Cont・DownMain/UpMain 等の OuDiaSecond1.00 拡張キーは「あれば読む」。
- EkiJikoku: `駅扱[;[着/]発]` のみ($番線なし)。**駅扱3(経由なし)は0(運行なし)に変換**
  (コメント「Ver2.0 経由なし削除に伴い」)。番線は主本線に設定。
- BrunchOpposite/LoopOpposite等は存在しない。

### 7.2 S05: OuDiaSecond.1.01〜1.05 (CconvCentDedS05.cpp)
- Ressya に別キー **`RessyaTrack`**(駅ごとの番線+作業をカンマ連結)と **`OperationNumber`** があり、
  読込時に現行の EkiJikoku 内番線・Before/AfterOperation・運用番号へ変換する
  (`BeforeOperation_From_string` / `AfterOperation_From_string`)。
  旧 RessyaTrack 1要素は `番線idx[;作業/p1$p2/p3]`、作業 0=なし/1=入換/2=入出区。
  **番線 idx は 1起点**(0 または範囲外 = 主本線)で、読込時に -1 して現行の0起点 index へ
  変換する(CconvCentDedS05.cpp コメント「Ver2.0以前は、0が主本線,1〜sizeが個別指定なので、-1する」)。
  現行 EkiJikoku の `$番線`(0起点)と1ずれる点に注意。
- OuterTerminal は `OuterTerminalEkimei` のみ(略称なし)。

### 7.3 S09: OuDiaSecond.1.06〜1.09 (CconvCentDedS09.cpp)
- 構造はほぼ現行。EkiJikoku に `$番線` あり、`Operation{path}` あり。
- Operation のパラメータ配置が旧式: 出区 `3/時刻$運番`(連携コードなし)、
  路線外始発 `4/駅idx$時刻/着時刻$運番`、前作業 Junction は `5/時刻$解結表示省略/仮運番(;連結)`
  (パラメータ区切りは現行と同じ `/`,`$`,`/`,`$` の交互固定順。仮運番は p3。
  Ver2.05 で解結表示省略が削除され、現行は p2 に仮運番)。読込時に現行モデルへマップ。
- `SyubetsuChange`(種別変更)キーが存在した(現行では次列車接続 type5 に統合)。

### 7.4 .oud (OuDia 1.02) の読み書き
- **読み込み**: FileType=`OuDia.1.02` → S00 リーダーで .oud2 と同一の文法で解釈
  (文字コードは BOM なし= Shift-JIS として読む)。
- **書き出し** (`CconvCDedRosenFileDataOud` + `CconvCentDedOud`): 拡張子 .oud で保存すると
  警告ダイアログ(「一部の情報が失われます」)後、FileType=`OuDia.1.02` で **Shift-JIS** 出力。
  - Rosen: Rosenmei / Eki× / Ressyasyubetsu× / Dia× / KitenJikoku /
    DiagramDgrYZahyouKyoriDefault / Comment のみ。
  - Eki: Ekimei / Ekijikokukeisiki / Ekikibo / Kyoukaisen / DiagramRessyajouhouHyouji系のみ。
    **Kyoukaisen は KudariChaku 駅の次が NoboriChaku 駅のとき 1 を自動生成**。
    KudariHatsuchaku/NoboriHatsuchaku は OuDia に無いため `Jikokukeisiki_Hatsuchaku` に落とす。
  - Ressya: Houkou/Syubetsu/Ressyabangou/Ressyamei/Gousuu/EkiJikoku/Bikou。
    EkiJikoku は **$番線なし**の旧書式。Operation・Canceled 等は出力しない。
  - DispProp は現行と同じ内容を出力(OuDia は未知キーを無視する想定)。

### 7.5 その他の入出力(参考)
`CconvCDedRosenFileDataDigital/2/3` は「外部時刻表インポート」(汎用テキスト/JRおでかけネット/JR北海道)で、
.oud2 形式とは無関係(CMainFrame.cpp から利用)。`.oud2backup` は自動バックアップで中身は .oud2 と同一
(保存後の変更フラグ処理のみ異なる)。時刻表CSV (`OuDiaSecond.JikokuhyouCsv.1`) は別形式。

---

## 8. エラーコード体系(参考)

`CDedRosenFileData_from_string` は負値を返し、段階ごとにオフセットが付く:
文法エラーは `CConvNodeContainer::decode` の負値(-1 Aborted / -2 NotClosed)を
`if (iResult < 0) iRv = -1` で**一括 -1** に潰す(-2 は表面化しない)。
エンティティ局所コードには `CentDedRosen_From_OuPropertiesText` 内で
Ressyasyubetsu 系 -100 / Dia 系 -200 のオフセットが付き(例: Syubetsumei 未指定 -11 → -111)、
`from_OuPropertiesText` 系は -1000 引き
(-1001 FileType不正, -1002 Rosenなし, -1003 DispPropなし, -1022 Ekijikokukeisiki不正,
-1032 Ekikibo不正, -1111 Syubetsumei未指定, -1152 DiagramSenStyle不正, -1211 DiaName未指定,
-1212 RessyaContなし, -1352 起点時刻不正 等)。DispProp 系はさらに -500。
エラー詳細は `COuErrorInfoContainer` に (Reason, Key=Value) 形式で蓄積されダイアログ表示される。

---

## 9. Web再実装に向けた論点

1. **パーサは小さい**。文法は「Key=Value / `Name.`〜`.` / エスケープ2種」だけで、
   `CConvNodeContainer` 相当(100行程度)を TypeScript で書けば全バージョンを読める。
   順序付き・同名重複可のノード列(`Array<{name, value?|children?}>`)をASTにするのが素直。
2. **文字コード**: 読込は BOM 判定で UTF-8 / Shift-JIS を切替える必要がある。ブラウザでは
   `TextDecoder('shift_jis')` が使える。0x5C 復旧ハック(§1)は「壊れたファイルの救済」であり
   互換再現は任意(実装しないと一部の旧SJISファイルで `\` が残る差異が出る)。
   書き出しは UTF-8+BOM+CRLF を厳守すれば本家で開ける。CR除去を必ず前処理に入れる。
3. **難所は EkiJikoku / Operation 文字列**。特に Operation の「`/`と`$`が交互に現れる固定順
   区切り+入れ子キー(`Operation13B.0A`)」は正規表現より逐次スキャンで実装すべき。
   区切り文字は値中にエスケープ手段がない(運用番号等に `/$,;` を含めると壊れる)点も本家同様。
4. **省略時デフォルトと出力条件の再現が互換性の核心**。多くの bool は「true のときだけキーを書く」、
   一部 int は「非デフォルトのときだけ書く」。ラウンドトリップ一致を目標にするなら本書 §5 の
   出力条件をテーブル駆動で実装し、sample2.oud2 / sample.oud2 のバイト一致テストを組むとよい。
5. **バージョン対応の割切り**: 読込は 5 グループ(S00/S05/S09/現行 + OuDia)。Web 版では
   「現行(1.10–1.17)+OuDia.1.02+1.00」をまず実装し、S05/S09 特有の RessyaTrack →
   Operation 変換は後回しにできる(実ファイル流通量は現行が支配的と【推測】)。
   書き出しは常に最新 FileType でよい(本家と同方針)。
6. **インデックス参照の整合**: 種別・番線・駅・ダイヤはすべて出現順 index 参照。編集操作
   (駅削除・種別並べ替え等)で index を振り直す EditCmd 層が本家に存在する。ファイルI/Oを
   モデルと分離しても、範囲外 index の補正規則(§5.2, §6.2, §6.4)は読込側に必ず入れること。
7. **Windows依存はI/O層のみ**: MFC/CFile 依存はなく fopen ベース。ノード変換層は純粋な
   文字列処理で移植容易。WindowPlacement ノードはデスクトップ MDI 前提の情報なので、
   Web 版では読み飛ばし+保存時に省略(または互換のため透過保持)でよい。
8. **数値パース**: 本家の寛容さはフィールドごとに異なる。`_ttoi`/`intOf` 系(Syubetsu 等)は
   非数→0 で寛容。`JikokuhyouJikokuDisplay*` / `JikokuhyouSyubetsuChangeDisplay*` 等は
   try/catch で例外をデフォルトに落とす。一方 **Operation 文字列のパラメータ**
   (`CentDedBeforeOperationCont_From_string` / `CentDedAfterOperationCont_From_string` の
   `stoi(strOperationPara1)` 等)や `JikokuhyouOperationOrigin`/`Terminal` は無防備な
   `std::stoi` で、空文字列・非数だと `std::invalid_argument` が送出され変換層では捕捉されない
   (列車読込は `#pragma omp parallel for` 内のため実質クラッシュ)。Web実装ではこれらも
   `parseInt` 失敗時 0/デフォルトへ落とす方が安全(本家より寛容になる差異として認識する)。
9. **時刻の秒表現**: ファイル上は秒付き時刻(`45930`)があり得る。内部は通算秒で持ち、
   表示丸め(SecondRound*)は表示層の責務(ファイルには丸めず生値が入る)。
10. **列車の Null 行**: `Houkou` が読めない `Ressya.` は Null 列車(空の時刻表列)として
    コンテナに保持され、書き出し時も空の `Ressya.` ノードとして出力される(§5.7)。
    空の `Ressya.` ノードは「空列」を表す正規の存在であり、**捨てると列数・列車 index が
    変わってしまう**ため、Web実装でも Null 列車として保持・ラウンドトリップすること。
