import { eventEmitter } from "../utils/EventSystem";

export const IMPORT_FIT_DIALOG_EVENT = "importFitDialog";

/** Opens the import-fit-from-clipboard dialog. */
export function showImportFitDialog() {
  eventEmitter.emit(IMPORT_FIT_DIALOG_EVENT, { isOpen: true });
}
