import { Stack } from "@mui/material";

/**
 * A row of chips that wraps onto further lines when it runs out of width — what was read, the ores
 * never chosen.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.label] - names the row for a screen reader, when it is a group of its own
 */
export function ChipRow({ children, label }) {
  return (
    <Stack
      direction="row"
      useFlexGap
      role={label ? "group" : undefined}
      aria-label={label}
      sx={{ flexWrap: "wrap", gap: 1 }}
    >
      {children}
    </Stack>
  );
}
