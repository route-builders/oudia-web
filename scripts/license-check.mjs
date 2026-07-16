// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/**
 * 依存ライブラリのライセンス検査(architecture §10)。
 * GPLv3 と互換なライセンスのみ許可し、非互換(コピーレフト非互換・NC 系等)の
 * 混入を CI で防ぐ。`pnpm licenses list --prod --json` の出力を検証する。
 *
 * 使い方: `pnpm license-check`(= node scripts/license-check.mjs)
 */

import { execFileSync } from 'node:child_process';

/**
 * GPLv3 互換として許可するライセンス(SPDX 識別子)。
 * MIT/ISC/BSD/Apache-2.0 等のパーミッシブ、および GPLv3 自身・LGPL・MPL-2.0 等。
 * Apache-2.0 は GPLv3 と一方向互換(GPLv3 側へ同梱可)。
 */
const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Python-2.0',
  'BlueOak-1.0.0',
  'Unlicense',
  'CC0-1.0',
  'WTFPL',
  'Zlib',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MPL-2.0',
]);

/** 明示的に許可しないライセンス(非互換の代表)。検出したら即 fail。 */
const FORBIDDEN_HINTS = ['CC-BY-NC', 'BUSL', 'SSPL', 'AGPL', 'GPL-2.0-only', 'CC-BY-ND'];

/** 個別パッケージのライセンス例外(名前 → 理由)。原則空。 */
const PACKAGE_EXCEPTIONS = new Map();

function normalize(license) {
  // "(MIT OR Apache-2.0)" のような複合式はトークンに分解し、いずれか許可なら OK。
  return license
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  let raw;
  try {
    raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // 依存が皆無だと pnpm が非ゼロ終了することがある。その場合は空とみなす。
    if (err.stdout && String(err.stdout).trim().length > 0) {
      raw = String(err.stdout);
    } else {
      console.log('ライセンス検査: 対象依存なし(または pnpm 出力なし)。パス。');
      return;
    }
  }

  /** @type {Record<string, Array<{name:string, versions?:string[]}>>} */
  const byLicense = JSON.parse(raw);

  const violations = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    const tokens = normalize(license);
    const forbidden = FORBIDDEN_HINTS.some((h) =>
      tokens.some((t) => t.toUpperCase().includes(h.toUpperCase())),
    );
    const anyAllowed = tokens.some((t) => ALLOWED.has(t));

    for (const pkg of packages) {
      if (PACKAGE_EXCEPTIONS.has(pkg.name)) continue;
      if (forbidden || !anyAllowed) {
        violations.push({ name: pkg.name, license, versions: pkg.versions ?? [] });
      }
    }
  }

  if (violations.length > 0) {
    console.error('❌ GPLv3 非互換の可能性があるライセンスを検出しました:');
    for (const v of violations) {
      console.error(`  - ${v.name} (${v.versions.join(', ')}): ${v.license}`);
    }
    console.error(
      '\nGPLv3 互換ライセンスのみ許可されます(architecture §10)。' +
        '許可リストは scripts/license-check.mjs の ALLOWED を参照。',
    );
    process.exit(1);
  }

  console.log('✅ ライセンス検査: 全依存が GPLv3 互換許可リスト内です。');
}

main();
