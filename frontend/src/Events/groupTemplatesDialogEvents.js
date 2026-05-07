import { eventEmitter } from "../utils/EventSystem";

export const GROUP_TEMPLATES_APPLY_DIALOG_EVENT = "groupTemplatesApplyDialog";
export const GROUP_TEMPLATES_SAVE_DIALOG_EVENT = "groupTemplatesSaveDialog";

/**
 * Opens the global “Apply group template” dialog (see `ApplyGroupTemplateDialog.jsx`).
 *
 * @param {object} [payload]
 * @param {string|null|undefined} [payload.contextGroupId] — When set, “Add to current group” targets this group id (resolved in the dialog via `getGroupObject`).
 */
export function openGroupTemplatesApplyDialog(payload = {}) {
  eventEmitter.emit(GROUP_TEMPLATES_APPLY_DIALOG_EVENT, {
    isOpen: true,
    openSession: Date.now(),
    contextGroupId:
      payload.contextGroupId != null && String(payload.contextGroupId) !== ""
        ? String(payload.contextGroupId)
        : null,
  });
}

export function closeGroupTemplatesApplyDialog() {
  eventEmitter.emit(GROUP_TEMPLATES_APPLY_DIALOG_EVENT, { isOpen: false });
}

/**
 * Opens the global "Save group as template" dialog.
 *
 * @param {object} [payload]
 * @param {string|null|undefined} [payload.contextGroupId] - Group context used by dialog to resolve jobs from store.
 */
export function openGroupTemplatesSaveDialog(payload = {}) {
  eventEmitter.emit(GROUP_TEMPLATES_SAVE_DIALOG_EVENT, {
    isOpen: true,
    openSession: Date.now(),
    contextGroupId:
      payload.contextGroupId != null && String(payload.contextGroupId) !== ""
        ? String(payload.contextGroupId)
        : null,
  });
}

export function closeGroupTemplatesSaveDialog() {
  eventEmitter.emit(GROUP_TEMPLATES_SAVE_DIALOG_EVENT, { isOpen: false });
}
