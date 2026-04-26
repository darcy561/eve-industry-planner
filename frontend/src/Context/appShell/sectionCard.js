import { alpha } from "@mui/material/styles";

/**
 * `sx` for section cards (onboarding / settings shells): soft bordered paper with tinted fill.
 */
export const appShellSetupSectionPaperSx = {
  p: { xs: 2, md: 2.5 },
  borderRadius: 3,
  borderColor: (theme) => alpha(theme.palette.primary.main, 0.2),
  backgroundColor: (theme) =>
    alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.72 : 0.9,
    ),
  backdropFilter: "blur(3px)",
};
