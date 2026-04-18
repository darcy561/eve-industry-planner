import { eventEmitter } from "../utils/EventSystem";

export const FEEDBACK_DIALOG_EVENT = "feedbackDialog";

/** Opens the floating feedback dialog (merges into {@link useDialogEventState}). */
export function openFeedbackDialog() {
  eventEmitter.emit(FEEDBACK_DIALOG_EVENT, { isOpen: true });
}
