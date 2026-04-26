import { alpha } from "@mui/material/styles";

/**
 * Compact loading panel (`LoadingPage` variant="simple"): same tone as app-shell
 * outlined controls — soft border and paper tint, without full branded scene.
 */
export const appShellSimpleLoadingSurfaceSx = {
  borderRadius: 2,
  borderColor: (theme) => alpha(theme.palette.primary.main, 0.22),
  backgroundColor: (theme) =>
    alpha(
      theme.palette.background.paper,
      theme.palette.mode === "dark" ? 0.55 : 0.96,
    ),
  backdropFilter: "blur(3px)",
  backgroundImage: "none",
  boxShadow: "none",
};
