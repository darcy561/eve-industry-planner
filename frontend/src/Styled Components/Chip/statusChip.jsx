import { Chip } from "@mui/material";

/**
 * The small state markers of the app-shell design: what a row's plan is, or
 * where a figure came from.
 *
 * A status is named rather than styled, so a panel does not decide for itself
 * which colour "already paid" is.
 */

/**
 * @enum {string}
 */
export const STATUS_TONE = {
  /** The chosen route, and the good one. */
  GOOD: "good",
  /** A choice worth revisiting — right now, but leaving something on the table. */
  WARN: "warn",
  /** About to stop being possible, or already past it. */
  BAD: "bad",
  /** Settled fact rather than a choice: a real price, a linked record. */
  FACT: "fact",
  /** A state with no weight either way. */
  NEUTRAL: "neutral",
};

const TONE_COLOUR = {
  [STATUS_TONE.GOOD]: "success",
  [STATUS_TONE.WARN]: "warning",
  [STATUS_TONE.BAD]: "error",
  [STATUS_TONE.FACT]: "primary",
  [STATUS_TONE.NEUTRAL]: "default",
};

/**
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {string} [props.tone] - One of STATUS_TONE
 * @param {object} [props.sx]
 */
export default function StatusChip({
  label,
  tone = STATUS_TONE.NEUTRAL,
  sx,
  ...rest
}) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={TONE_COLOUR[tone] ?? "default"}
      label={label}
      sx={sx}
      {...rest}
    />
  );
}
