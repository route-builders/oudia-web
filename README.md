# oudia-web

OuDiaSecond を web に移植しようプロジェクト。

Windows 向け時刻表・ダイヤグラム作成ソフト [OuDiaSecond](https://take-okm.hatenablog.com/)(C++/MFC, GPLv3)を TypeScript + React でブラウザ向けに再実装する。

## ドキュメント

- 索引・読む順序: [docs/README.md](docs/README.md)
- 開発環境: [docs/dev-setup.md](docs/dev-setup.md)
- ロードマップ: [docs/design/07_roadmap.md](docs/design/07_roadmap.md)

## 開発

Node.js 22 LTS + pnpm 9 系(Corepack)。

```bash
corepack enable pnpm
pnpm install
pnpm typecheck && pnpm check:code && pnpm test   # コミット前の最低ライン
```

主なコマンドは [docs/dev-setup.md §4](docs/dev-setup.md) を参照。

## 構成

```
packages/
├── format/   oud2/oud のパース・シリアライズ・CSV(DOM 非依存)
├── domain/   エンティティ・時刻演算・コマンド・整合カスケード
├── derive/   導出計算(ダイヤレイアウト・cellSpec・運用探索)
└── render/   Canvas 描画
apps/
└── web/      React シェル・PWA
```

依存方向は `format ← domain ← derive ← render ← app` の一方向のみ。

現状は M0(開発基盤)+ スパイク S1(oud2 ラウンドトリップのバイト一致実証)まで実装済み。

## License

GPLv3 でライセンスされています。詳細については [LICENCE](LICENCE) をご覧ください。

本ソフトウェアは take-okm 氏の OuDia(Copyright (C) 2006-2017 take-okm)を改造した
diagram_mania 氏の OuDiaSecond(Copyright (C) 2017-2026 diagram_mania)の派生物です。
