import { Typography } from "@mui/material";

/**
 * Axis labels for a set of month rows: a month still in progress says so, and a
 * long window drops the century so the labels fit.
 *
 * @param {{month: string, complete?: boolean}[]} rows
 * @returns {(value: string) => string}
 */
export function monthLabel(rows = []) {
  const many = rows.length > 12;
  return (value) => {
    const row = rows.find((r) => r.month === value);
    const text = many ? value.slice(2) : value;
    return row && row.complete === false ? `${text} (so far)` : text;
  };
}

/** Empty state, so a panel with no rows says why rather than drawing nothing. */
export function NoData({ children }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }} align="center">
      {children}
    </Typography>
  );
}
