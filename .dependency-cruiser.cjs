// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * パッケージ間の依存方向を一方向に強制する。
 *   format ← domain ← derive ← render ← app
 * 逆依存・循環依存は CI エラーにする(coding-standards §3、architecture §3.2)。
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '循環依存は禁止(依存方向は一方向のみ)。',
      from: {},
      to: { circular: true },
    },
    {
      name: 'layer-format-no-upward',
      severity: 'error',
      comment: 'format は最上流。domain/derive/render/app に依存してはならない。',
      from: { path: '^packages/format/' },
      to: {
        path: '^(packages/(domain|derive|render)|apps/web)/',
      },
    },
    {
      name: 'layer-domain-no-upward',
      severity: 'error',
      comment: 'domain は derive/render/app に依存してはならない(format のみ可)。',
      from: { path: '^packages/domain/' },
      to: { path: '^(packages/(derive|render)|apps/web)/' },
    },
    {
      name: 'layer-derive-no-upward',
      severity: 'error',
      comment: 'derive は render/app に依存してはならない。',
      from: { path: '^packages/derive/' },
      to: { path: '^(packages/render|apps/web)/' },
    },
    {
      name: 'layer-render-no-upward',
      severity: 'error',
      comment: 'render は app に依存してはならない。',
      from: { path: '^packages/render/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'format-no-dom',
      severity: 'error',
      comment: 'format は DOM 非依存を保つ(Node 単体で Vitest 実行するため)。coding-standards §3。',
      from: { path: '^packages/format/' },
      to: { dependencyTypes: ['core'], path: '^(dom|jsdom)$' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: '本体コードが devDependencies を import してはならない。',
      from: { path: '^(packages|apps)', pathNot: '\\.(test|bench|spec)\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: '(^|/)(node_modules|dist|coverage|fixtures)/',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
