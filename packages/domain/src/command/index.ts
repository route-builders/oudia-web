// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 oudia-second-web contributors

/** 編集コマンド基盤の公開 API(architecture §4.3–§4.4)。 */

export type {
  EditCommand,
  EditCommandType,
  CommentSetCommand,
  RessyaReplaceRangeCommand,
  RessyaSwapCommand,
  RessyaSetPropCommand,
  RessyaSetCanceledCommand,
  RessyaSetSihatsuEkiCommand,
  RessyaSetSyuuchakuEkiCommand,
  EkiJikokuSetChakuCommand,
  EkiJikokuSetHatsuCommand,
  EkiJikokuSetTrackCommand,
  EkiJikokuClearCommand,
  EkiJikokuToggleTsuukaCommand,
  EkiJikokuSetKeiyunasiCommand,
  HistoryEntry,
} from './types.js';
export { commandReducers, applyCommand, normalizeToLf } from './reducers.js';
export { decodeJikokuWithHourCompletion, subJikokuWrapped } from './jikokuCompletion.js';
export {
  createDocumentState,
  executeCommand,
  undo,
  redo,
  markSaved,
  canUndo,
  canRedo,
  isDirty,
  INT_MAX,
  DEFAULT_UNDO_DEPTH,
} from './engine.js';
export type { DocumentState } from './engine.js';
