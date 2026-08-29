import { alpha } from "@mui/material/styles";

/**
 * Shared outlined-control look for app-shell / onboarding-style surfaces.
 * Use: `sx={(theme) => ({ ...appShellOutlinedFormControl(theme) })}`.
 */
export function appShellOutlinedFormControl(theme) {
  const border = alpha(theme.palette.primary.main, 0.22);
  const borderHover = alpha(theme.palette.primary.main, 0.45);
  const fill = alpha(
    theme.palette.background.paper,
    theme.palette.mode === "dark" ? 0.55 : 0.96,
  );
  return {
    "& .MuiOutlinedInput-root": {
      borderRadius: 2,
      bgcolor: fill,
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: border,
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: borderHover,
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.palette.primary.main,
        borderWidth: 1,
      },
    },
  };
}

export const appShellHelperTextSx = {
  mt: 0.75,
  mx: 0,
  color: "text.secondary",
};

/** Menu panel for outlined selects using app-shell styling */
export function appShellSelectMenuPaperSx(theme) {
  return {
    borderRadius: 2,
    mt: 0.5,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.22)}`,
    boxShadow: theme.shadows[6],
    bgcolor: alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.96 : 0.99,
    ),
    backdropFilter: "blur(10px)",
    maxHeight: 320,
    overflow: "hidden",
    backgroundImage: "none",
  };
}

/** List + menu items inside app-shell select menus */
export function appShellSelectMenuListSx(theme) {
  const hover = alpha(theme.palette.primary.main, 0.1);
  const selectedBg = alpha(theme.palette.primary.main, 0.16);
  const selectedHover = alpha(theme.palette.primary.main, 0.22);
  return {
    py: 0.75,
    px: 0.5,
    "& .MuiMenuItem-root": {
      borderRadius: 1.25,
      mx: 0.5,
      my: 0.125,
      minHeight: 40,
      typography: "body2",
      color: "text.primary",
      "&:hover": {
        bgcolor: hover,
      },
      "&.Mui-selected": {
        bgcolor: selectedBg,
        fontWeight: 600,
        "&:hover": {
          bgcolor: selectedHover,
        },
      },
      "&.Mui-focusVisible": {
        bgcolor: hover,
      },
    },
  };
}

/** Autocomplete listbox options (matches select menu item styling). */
export function appShellAutocompleteListboxSx(theme) {
  const hover = alpha(theme.palette.primary.main, 0.1);
  const selectedBg = alpha(theme.palette.primary.main, 0.16);
  const selectedHover = alpha(theme.palette.primary.main, 0.22);
  return {
    py: 0.75,
    px: 0.5,
    maxHeight: 280,
    "& .MuiAutocomplete-option": {
      borderRadius: 1.25,
      mx: 0.5,
      my: 0.125,
      minHeight: 40,
      typography: "body2",
      "&:hover": {
        bgcolor: hover,
      },
      '&[aria-selected="true"]': {
        bgcolor: selectedBg,
        fontWeight: 600,
      },
      '&[aria-selected="true"].Mui-focused': {
        bgcolor: selectedHover,
      },
    },
  };
}

/** Full `MenuProps` for MUI `Select` using app-shell menu styling. */
export function getAppShellSelectMenuProps(theme) {
  return {
    anchorOrigin: { vertical: "bottom", horizontal: "left" },
    transformOrigin: { vertical: "top", horizontal: "left" },
    marginThreshold: 8,
    // MUI v9 Menu uses slots; legacy PaperProps/MenuListProps on MenuProps leak to Modal/DOM.
    slotProps: {
      paper: {
        sx: appShellSelectMenuPaperSx(theme),
      },
      list: {
        dense: true,
        sx: appShellSelectMenuListSx(theme),
      },
    },
  };
}

export function appShellTextFieldOutlinedSx(theme) {
  return {
    ...appShellOutlinedFormControl(theme),
    "& .MuiInputLabel-root": {
      color: "text.secondary",
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "primary.main",
    },
    "& .MuiFormHelperText-root": {
      color: "text.secondary",
      mt: 0.75,
    },
  };
}

/** Bordered inset surface (dialogueues, dense tool panels). */
export function appShellInsetSurfaceSx(theme) {
  return {
    borderRadius: 2,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    backgroundColor: alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.55 : 0.96,
    ),
  };
}

/** MUI Slider accents aligned with app-shell primary outlines. */
export function appShellSliderSx(theme) {
  const primary = theme.palette.primary.main;
  return {
    color: primary,
    height: 8,
    py: 0.5,
    "& .MuiSlider-rail": {
      opacity: 1,
      backgroundColor: alpha(primary, theme.palette.mode === "dark" ? 0.22 : 0.16),
    },
    "& .MuiSlider-track": {
      border: "none",
      backgroundColor: alpha(primary, theme.palette.mode === "dark" ? 0.55 : 0.42),
    },
    "& .MuiSlider-thumb": {
      width: 18,
      height: 18,
      backgroundColor: primary,
      border: `2px solid ${theme.palette.background.paper}`,
      "&:hover, &.Mui-focusVisible": {
        boxShadow: `0 0 0 6px ${alpha(primary, 0.22)}`,
      },
    },
    "& .MuiSlider-mark": {
      backgroundColor: alpha(primary, 0.48),
      height: 4,
      width: 2,
      borderRadius: 1,
    },
    "& .MuiSlider-valueLabel": {
      backgroundColor: alpha(theme.palette.background.paper, 0.98),
      color: theme.palette.text.primary,
      border: `1px solid ${alpha(primary, 0.28)}`,
      borderRadius: 1,
      boxShadow: theme.shadows[3],
      fontSize: theme.typography.caption.fontSize,
    },
  };
}

/**
 * Dense market order tables: app-shell primary (blue) trim — same for sell and buy sides.
 * @param {import("@mui/material/styles").Theme} theme
 */
export function appShellMarketDataGridSx(theme) {
  const edge = alpha(theme.palette.primary.main, 0.2);
  const accent = theme.palette.primary.main;
  const headerBg = alpha(
    accent,
    theme.palette.mode === "dark" ? 0.12 : 0.08,
  );
  const hover = alpha(accent, 0.085);
  const paperFill = alpha(
    theme.palette.background.paper,
    theme.palette.mode === "dark" ? 0.72 : 0.97,
  );

  return {
    border: `1px solid ${edge}`,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: paperFill,
    color: theme.palette.text.primary,
    "& .MuiDataGrid-columnHeaders": {
      borderBottom: `1px solid ${alpha(accent, 0.35)}`,
      backgroundColor: headerBg,
    },
    "& .MuiDataGrid-columnHeader": {
      padding: theme.spacing(0.5, 1),
      outline: "none",
    },
    "& .MuiDataGrid-columnHeaderTitle": {
      fontWeight: 600,
      fontSize: theme.typography.caption.fontSize,
      letterSpacing: 0.02,
      color: theme.palette.text.primary,
    },
    "& .MuiDataGrid-sortIcon": {
      color: alpha(accent, 0.85),
    },
    "& .MuiDataGrid-cell": {
      borderColor: alpha(theme.palette.divider, 0.45),
      fontSize: theme.typography.caption.fontSize,
      color: theme.palette.text.secondary,
    },
    "& .MuiDataGrid-cell--textRight": {
      color: theme.palette.text.primary,
      fontVariantNumeric: "tabular-nums",
    },
    "& .MuiDataGrid-row:hover": {
      backgroundColor: hover,
    },
    "& .MuiDataGrid-row.Mui-selected": {
      backgroundColor: alpha(accent, 0.14),
      "&:hover": {
        backgroundColor: alpha(accent, 0.18),
      },
    },
    "& .MuiDataGrid-footerContainer": {
      borderTop: `1px solid ${edge}`,
    },
    "& .MuiDataGrid-iconSeparator": {
      color: alpha(accent, 0.4),
    },
    "& .MuiDataGrid-overlayWrapper": {
      backgroundColor: alpha(theme.palette.background.paper, 0.65),
    },
    "& .MuiLinearProgress-root": {
      backgroundColor: alpha(theme.palette.primary.main, 0.12),
      "& .MuiLinearProgress-bar": {
        backgroundColor: alpha(theme.palette.primary.main, 0.55),
      },
    },
    "& .MuiSkeleton-root": {
      bgcolor: alpha(theme.palette.primary.main, 0.08),
    },
  };
}
