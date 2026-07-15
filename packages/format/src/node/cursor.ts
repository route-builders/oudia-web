// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors
//
// Based on OuDiaSecond (Copyright (C) 2017-2026 diagram_mania)
// and OuDia (Copyright (C) 2006-2017 take-okm)

/**
 * NodeCursor: ディレクトリ内のノードを消費追跡つきで読む(file-io §3.4)。
 *
 * 目的: (1) 同名 n 番目アクセス(原典 getInName / sizeInName)、
 *       (2) 未消費ノードの検出(未知キー保全 §3.8 の基礎)。
 *
 * 消費した(read した)ノードには consumed マークを付け、unconsumed() が
 * 未消費ノードを「直前の消費済み兄弟」アンカーつきで列挙する。
 */

import type { PtDirectory, PtNode } from './types.js';

/** 未消費ノードのアンカー(直前の消費済み兄弟の name と、その name 内での出現番号)。 */
export interface Anchor {
  name: string;
  occurrence: number;
}

/** 未消費ノード(アンカーつき)。エンティティに写像されない中間ノードの保全に使う。 */
export interface UnconsumedNode {
  /** 元コンテナ内での出現位置(0 起点、既知/未知を含む通し番号)。 */
  index: number;
  node: PtNode;
}

export class NodeCursor {
  private readonly nodes: readonly PtNode[];
  private readonly consumed: boolean[];

  constructor(dir: PtDirectory) {
    this.nodes = dir.children;
    this.consumed = new Array<boolean>(dir.children.length).fill(false);
  }

  /** 同名プロパティの値を全件返す(消費マークを付ける)。順序は出現順。 */
  values(name: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node?.kind === 'property' && node.name === name) {
        this.consumed[i] = true;
        out.push(node.value);
      }
    }
    return out;
  }

  /** 同名プロパティの先頭 1 件の値(なければ undefined)。 */
  value(name: string): string | undefined {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node?.kind === 'property' && node.name === name) {
        this.consumed[i] = true;
        return node.value;
      }
    }
    return undefined;
  }

  /** 同名ディレクトリを全件返す(消費マークを付ける)。 */
  directories(name: string): PtDirectory[] {
    const out: PtDirectory[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node?.kind === 'directory' && node.name === name) {
        this.consumed[i] = true;
        out.push(node);
      }
    }
    return out;
  }

  /** 同名ディレクトリの先頭 1 件(なければ undefined)。 */
  directory(name: string): PtDirectory | undefined {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node?.kind === 'directory' && node.name === name) {
        this.consumed[i] = true;
        return node;
      }
    }
    return undefined;
  }

  /** 未消費ノードを出現位置つきで列挙する(§3.8 の未知キー保全に使う)。 */
  unconsumed(): UnconsumedNode[] {
    const out: UnconsumedNode[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node !== undefined && !this.consumed[i]) {
        out.push({ index: i, node });
      }
    }
    return out;
  }
}
