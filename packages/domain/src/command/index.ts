// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 up-tri

/** 編集コマンド基盤の公開 API(architecture §4.3–§4.4)。 */

export type { PasteIdouryou, RessyaClipboard } from './clipboard.js';
export {
  addToTrailingNumber,
  computePasteTrains,
  copyRessyaToClipboard,
  NO_PASTE_IDOURYOU,
} from './clipboard.js';
export type { DocumentState } from './engine.js';
export {
  canRedo,
  canUndo,
  createDocumentState,
  DEFAULT_UNDO_DEPTH,
  executeCommand,
  INT_MAX,
  isDirty,
  markSaved,
  redo,
  undo,
} from './engine.js';
export { decodeJikokuWithHourCompletion, subJikokuWrapped } from './jikokuCompletion.js';
export { applyCommand, commandReducers, normalizeToLf } from './reducers.js';
export type {
  CommentSetCommand,
  EditCommand,
  EditCommandType,
  EkiJikokuClearCommand,
  EkiJikokuModifyOperation2Command,
  EkiJikokuRenzokuInputCommand,
  EkiJikokuSetChakuCommand,
  EkiJikokuSetEkiatsukaiCommand,
  EkiJikokuSetHatsuCommand,
  EkiJikokuSetKeiyunasiCommand,
  EkiJikokuSetTrackCommand,
  EkiJikokuShiftJikokuCommand,
  EkiJikokuToggleTsuukaCommand,
  EkiJikokuToggleTsuukaTeisyaCommand,
  EkiJikokuWriteJikokuCommand,
  EkijikokuModifyOperation2,
  HistoryEntry,
  RessyaDirectCommand,
  RessyaModifyBangouCommand,
  RessyaPasteEkiJikokuCommand,
  RessyaReorderCommand,
  RessyaReplaceRangeCommand,
  RessyaSetCanceledCommand,
  RessyaSetPropCommand,
  RessyaSetSihatsuEkiCommand,
  RessyaSetSyuuchakuEkiCommand,
  RessyaStepSyubetsuCommand,
  RessyaSwapCommand,
  RessyaToggleCanceledCommand,
  RessyaUndirectCommand,
  RessyaUnifyCommand,
} from './types.js';
export { isNullModifyOperation2 } from './types.js';
