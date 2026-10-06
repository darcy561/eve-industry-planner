import { Typography } from "@mui/material";

/** A quiet line beneath a figure, saying what it is set against or how far it could range. */
export function FigureNote({ children }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      component="div"
      sx={{ fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </Typography>
  );
}
