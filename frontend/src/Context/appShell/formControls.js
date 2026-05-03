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
