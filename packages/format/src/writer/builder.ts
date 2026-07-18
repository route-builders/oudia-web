// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * ノードツリー構築ヘルパ(NodeCursor の逆)。file-io §4。
 *
 * 各エンティティライターは NodeBuilder に既知キーを**正準順**で push し、最後に
 * unknownEntries を記録 index 位置へ差し戻す(architecture §6.1 #5: 未知キーを
 * 位置情報つきで保持し同位置へ書き戻す)。これにより未知キーを含むファイルも
 * バイト一致で往復する。
 */

import type { RawEntry, UnknownEntry } from '../model/basic.js';
import type { PtDirectory, PtNode } from '../node/types.js';

/**
 * 既知ノードを正準順で受け取り、unknownEntries を index 位置へ差し戻して
 * 子ノード列を確定する。
 *
 * 差し戻しアルゴリズム(§6.1 #5): 既知ノードを正準順に並べた配列に対し、
 * unknownEntries を index 昇順で各 index 位置へ splice する。適合ライターが
 * 書いたファイル(= 既知キーが正準順)なら元の並びを厳密に再現する。
 */
export class NodeBuilder {
  private readonly known: PtNode[] = [];

  /** プロパティ行を追加(name=value)。 */
  prop(name: string, value: string): this {
    this.known.push({ kind: 'property', name, value });
    return this;
  }

  /** 完成済みディレクトリノードを追加。 */
  dir(name: string, children: readonly PtNode[]): this {
    this.known.push({ kind: 'directory', name, children });
    return this;
  }

  /** 既に組み立てた PtNode を直接追加(サブディレクトリ挿入用)。 */
  node(node: PtNode): this {
    this.known.push(node);
    return this;
  }

  /**
   * unknownEntries を index 位置へ差し戻して子ノード列を確定する。
   * container 付き(中間ディレクトリ由来)の未知は呼出し側で除外済みとする。
   */
  build(unknownEntries?: readonly UnknownEntry[]): PtNode[] {
    if (unknownEntries === undefined || unknownEntries.length === 0) {
      return this.known;
    }
    const out = this.known.slice();
    // index 昇順で splice(小さい index から入れると後続 index が保たれる)。
    const sorted = [...unknownEntries].sort((a, b) => a.index - b.index);
    for (const entry of sorted) {
      const node = nodeOfUnknown(entry);
      const pos = Math.min(entry.index, out.length);
      out.splice(pos, 0, node);
    }
    return out;
  }

  /** ディレクトリノードとして確定する(name + 子ノード列)。 */
  buildDir(name: string, unknownEntries?: readonly UnknownEntry[]): PtDirectory {
    return { kind: 'directory', name, children: this.build(unknownEntries) };
  }
}

/** UnknownEntry → PtNode(プロパティ or 未解釈ディレクトリ)。 */
function nodeOfUnknown(entry: UnknownEntry): PtNode {
  if (entry.children !== undefined) {
    return { kind: 'directory', name: entry.name, children: entry.children.map(nodeOfRaw) };
  }
  return { kind: 'property', name: entry.name, value: entry.value ?? '' };
}

/** RawEntry → PtNode(WindowPlacement・未解釈サブツリーの復元)。 */
export function nodeOfRaw(raw: RawEntry): PtNode {
  if (raw.children !== undefined) {
    return { kind: 'directory', name: raw.name, children: raw.children.map(nodeOfRaw) };
  }
  return { kind: 'property', name: raw.name, value: raw.value ?? '' };
}

/**
 * 中間ディレクトリ(EkiTrack2Cont. / Kudari. / Nobori.)直下の未知エントリを
 * container 名で振り分ける。親エンティティの build 時に既知外未知として使う。
 */
export function partitionUnknownByContainer(unknownEntries: readonly UnknownEntry[] | undefined): {
  direct: UnknownEntry[];
  byContainer: Map<string, UnknownEntry[]>;
} {
  const direct: UnknownEntry[] = [];
  const byContainer = new Map<string, UnknownEntry[]>();
  if (unknownEntries === undefined) return { direct, byContainer };
  for (const entry of unknownEntries) {
    if (entry.container === undefined) {
      direct.push(entry);
    } else {
      const list = byContainer.get(entry.container) ?? [];
      list.push(entry);
      byContainer.set(entry.container, list);
    }
  }
  return { direct, byContainer };
}
