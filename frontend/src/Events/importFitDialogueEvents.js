import { eventEmitter } from "../utils/EventSystem";

export const IMPORT_FIT_DIALOGUE_EVENT = "importFitDialogue";

/** Opens the import-fit-from-clipboard dialogue. */
export function showImportFitDialogue() {
  eventEmitter.emit(IMPORT_FIT_DIALOGUE_EVENT, { isOpen: true });
}
