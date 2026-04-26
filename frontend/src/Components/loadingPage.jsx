import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { appShellSimpleLoadingSurfaceSx } from "../Context/appShell";
import {
  LoadingBrandBackdrop,
  LoadingBrandScene,
} from "./loadingBrand";

/**
 * @param {Object} props
 * @param {'embedded' | 'route' | 'simple'} [props.variant]
 *   - `route` / `embedded`: branded full scene (`LoadingBrand*` — logo, glow, dots).
 *   - `simple`: compact spinner + caption inside an app-shell surface (bordered
 *     tinted panel), for in-panel Suspense (e.g. Edit Job steps) — not the branded route loader.
 * @param {string} [props.helperText] — Caption under the spinner when `variant="simple"` (updates when the prop changes).
 */
export function LoadingPage({
  variant = "embedded",
  helperText = "Loading…",
}) {
  if (variant === "simple") {
    return (
      <Box
        role="status"
        aria-live="polite"
        aria-label={helperText}
        sx={{
          flex: 1,
          alignSelf: "stretch",
          minHeight: 0,
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 200,
        }}
      >
        <Paper
          variant="outlined"
          elevation={0}
          sx={{
            ...appShellSimpleLoadingSurfaceSx,
            p: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            minWidth: 200,
            maxWidth: "100%",
          }}
        >
          <CircularProgress />
          <Typography variant="caption" color="text.secondary" align="center">
            {helperText}
          </Typography>
        </Paper>
      </Box>
    );
  }

  const density = variant === "route" ? "page" : "embedded";

  const layoutSx =
    variant === "route"
      ? {
          minHeight: "100dvh",
          width: "100%",
          boxSizing: "border-box",
        }
      : {
          flex: 1,
          alignSelf: "stretch",
          minHeight: 0,
          width: "100%",
          boxSizing: "border-box",
        };

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label="Loading"
      sx={{
        ...layoutSx,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <LoadingBrandBackdrop sx={{ flex: 1, width: "100%", minHeight: 0 }}>
        <LoadingBrandScene density={density} caption="Loading…" />
      </LoadingBrandBackdrop>
    </Box>
  );
}
