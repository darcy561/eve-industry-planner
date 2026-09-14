import { Box, Checkbox, Paper, Radio, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { appShellNestedCardSx } from "../../Context/appShell";
import { activateOnEnterOrSpace } from "./cardActivation";

/**
 * A card a player picks, as one of a set or on its own.
 *
 * The whole card is the control, so the hit area matches what a reader thinks
 * they are clicking. The input inside is decoration — it mirrors the card's
 * state and is hidden from assistive technology, because the card already
 * carries the role and the state.
 *
 * @param {object} props
 * @param {boolean} props.selected
 * @param {() => void} props.onSelect
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.body]
 * @param {'radio'|'checkbox'} [props.control] - One of a set, or independent
 * @param {boolean} [props.disabled]
 * @param {object} [props.sx]
 */
export default function SelectableCard({
  selected,
  onSelect,
  title,
  body,
  control = "radio",
  disabled = false,
  sx,
  ...rest
}) {
  const activate = () => {
    if (!disabled) onSelect?.();
  };

  const Control = control === "checkbox" ? Checkbox : Radio;

  return (
    <Paper
      variant="outlined"
      role={control}
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      onKeyDown={activateOnEnterOrSpace(activate)}
      sx={[
        (theme) => ({
          ...appShellNestedCardSx,
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.55 : 1,
          pointerEvents: disabled ? "none" : "auto",
          outline: "none",
          ...(selected
            ? {
                borderColor: alpha(theme.palette.primary.main, 0.42),
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  theme.palette.mode === "dark" ? 0.14 : 0.09,
                ),
              }
            : {}),
          transition: theme.transitions.create(
            ["border-color", "background-color"],
            { duration: theme.transitions.duration.shorter },
          ),
          "&:hover": {
            borderColor: alpha(theme.palette.primary.main, 0.32),
          },
          "&:focus-visible": {
            boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.35)}`,
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      <Control
        checked={selected}
        tabIndex={-1}
        slotProps={{ input: { "aria-hidden": true, tabIndex: -1 } }}
        sx={{ p: 0, mt: 0.25, pointerEvents: "none" }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2">{title}</Typography>
        {body ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {body}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}
