import { Box, Checkbox, Paper, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

/**
 * Shared first-login checkbox-style choice row.
 */
export function FirstLoginChoiceRow({
  selected,
  onSelect,
  title,
  body,
  checkboxChecked,
  sx,
}) {
  const checked = checkboxChecked ?? selected;

  return (
    <Paper
      variant="outlined"
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      sx={(theme) => ({
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        p: 1.5,
        borderRadius: 2,
        cursor: "pointer",
        outline: "none",
        borderColor: alpha(theme.palette.primary.main, selected ? 0.42 : 0.16),
        bgcolor: selected
          ? alpha(
              theme.palette.primary.main,
              theme.palette.mode === "dark" ? 0.14 : 0.09,
            )
          : alpha(theme.palette.background.paper, 0.35),
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
        ...sx,
      })}
    >
      <Checkbox
        checked={checked}
        tabIndex={-1}
        slotProps={{ input: { "aria-hidden": true } }}
        sx={{
          p: 0,
          mt: 0.25,
          pointerEvents: "none",
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {body}
        </Typography>
      </Box>
    </Paper>
  );
}
