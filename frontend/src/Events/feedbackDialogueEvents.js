import { eventEmitter } from "../utils/EventSystem";

export const FEEDBACK_DIALOGUE_EVENT = "feedbackDialogue";

/** Opens the floating feedback dialogue (merges into {@link useDialogueEventState}). */
export function openFeedbackDialogue() {
  eventEmitter.emit(FEEDBACK_DIALOGUE_EVENT, { isOpen: true });
}
