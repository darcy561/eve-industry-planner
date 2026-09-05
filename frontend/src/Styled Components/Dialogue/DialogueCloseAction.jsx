import { Button } from "@mui/material";

/** Standard text Close action for {@link ContentDialogue} `actions`; pass the same `onClose` as the dialogue. */
export function DialogueCloseAction({ onClose, children = "Close", ...rest }) {
  return (
    <Button size="small" variant="text" onClick={onClose} {...rest}>
      {children}
    </Button>
  );
}
