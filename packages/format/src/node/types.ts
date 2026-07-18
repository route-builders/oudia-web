// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * OuPropertiesText のノードツリー(中間表現)。
 *
 * ノードは 2 種類: プロパティ(Key=Value 行)とディレクトリ(名前付き子コンテナ)。
 * **順序付き配列**であり Map にしない。同名キーの繰り返し(`Eki.`×n、
 * `JikokuhyouFont`×8 等)と出現順が正規の表現だからである(file-io §3.2、analysis §2)。
 *
 * 原典対応: CNode / CPropertyString / CDirectory / CNodeContainer。
 */

export type PtNode = PtProperty | PtDirectory;

export interface PtProperty {
  readonly kind: 'property';
  /** 最初の '=' より前。'=' が無い行は行全体。 */
  readonly name: string;
  /** エスケープ解除済み。'=' が無い行は ''。 */
  readonly value: string;
}

export interface PtDirectory {
  readonly kind: 'directory';
  /** 末尾 '.' を除いた名前。 */
  readonly name: string;
  /** 出現順を完全保存した子ノード列。 */
  readonly children: readonly PtNode[];
}

export function isProperty(node: PtNode): node is PtProperty {
  return node.kind === 'property';
}

export function isDirectory(node: PtNode): node is PtDirectory {
  return node.kind === 'directory';
}
