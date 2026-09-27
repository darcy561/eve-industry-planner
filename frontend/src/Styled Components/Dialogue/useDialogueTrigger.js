import { startTransition, useCallback, useMemo, useState } from "react";

/**
 * Open state for a dialogue driven by the component that owns it, as
 * `useDialogueEventState` is for one driven by an app event.
 *
 * `dialogueProps` carries what `ContentDialogue` needs, so the owner spreads it
 * rather than wiring `open` and `onClose` by hand. A dialogue that must clear
 * what the reader typed wraps `close` in `useDialogueCloseReset`.
 *
 * @returns {{isOpen: boolean, open: Function, close: Function, dialogueProps: {open: boolean, onClose: Function}}}
 */
export function useDialogueTrigger() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => startTransition(() => setIsOpen(false)), []);

  return useMemo(
    () => ({
      isOpen,
      open,
      close,
      dialogueProps: { open: isOpen, onClose: close },
    }),
    [isOpen, open, close],
  );
}
