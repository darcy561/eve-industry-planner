import { Button } from "@mui/material";

/** Standard text Close action for {@link ContentDialog} `actions`; pass the same `onClose` as the dialog. */
export function DialogCloseAction({ onClose, children = "Close", ...rest }) {
  return (
    <Button size="small" variant="text" onClick={onClose} {...rest}>
      {children}
    </Button>
  );
}
