import { eventEmitter } from "../utils/EventSystem";

export const GROUP_TEMPLATES_APPLY_DIALOGUE_EVENT = "groupTemplatesApplyDialogue";
export const GROUP_TEMPLATES_SAVE_DIALOGUE_EVENT = "groupTemplatesSaveDialogue";

/**
 * Opens the global “Apply group template” dialogue (see `ApplyGroupTemplateDialogue.jsx`).
 *
 * @param {object} [payload]
 * @param {string|null|undefined} [payload.contextGroupId] — When set, “Add to current group” targets this group id (resolved in the dialogue via `getGroupObject`).
 */
export function openGroupTemplatesApplyDialogue(payload = {}) {
  eventEmitter.emit(GROUP_TEMPLATES_APPLY_DIALOGUE_EVENT, {
    isOpen: true,
    openSession: Date.now(),
    contextGroupId:
      payload.contextGroupId != null && String(payload.contextGroupId) !== ""
        ? String(payload.contextGroupId)
        : null,
  });
}

export function closeGroupTemplatesApplyDialogue() {
  eventEmitter.emit(GROUP_TEMPLATES_APPLY_DIALOGUE_EVENT, { isOpen: false });
}

/**
 * Opens the global "Save group as template" dialogue.
 *
 * @param {object} [payload]
 * @param {string|null|undefined} [payload.contextGroupId] - Group context used by dialogue to resolve jobs from store.
 */
export function openGroupTemplatesSaveDialogue(payload = {}) {
  eventEmitter.emit(GROUP_TEMPLATES_SAVE_DIALOGUE_EVENT, {
    isOpen: true,
    openSession: Date.now(),
    contextGroupId:
      payload.contextGroupId != null && String(payload.contextGroupId) !== ""
        ? String(payload.contextGroupId)
        : null,
  });
}

export function closeGroupTemplatesSaveDialogue() {
  eventEmitter.emit(GROUP_TEMPLATES_SAVE_DIALOGUE_EVENT, { isOpen: false });
}
