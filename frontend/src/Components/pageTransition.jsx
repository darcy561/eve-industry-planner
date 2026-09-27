import { Box } from "@mui/material";
import { ViewTransition } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Key identifying the full-page view on screen — the route pattern rather than
 * the resolved path, so changing a param updates the page in place.
 *
 * @param {boolean} isMaintenanceMode
 * @returns {string}
 */
export function usePageKey(isMaintenanceMode) {
  const routeId = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? "",
  });
  return isMaintenanceMode ? "maintenance" : routeId;
}

/**
 * Animates the swap between full-page views, each rendered on its own surface
 * keyed by the page it holds.
 *
 * @param {Object} props
 * @param {string} props.contentKey Changing this swaps the page.
 * @param {React.ReactNode} props.children
 * @param {import("@mui/material").SxProps} [props.sx]
 */
export default function PageTransition({ contentKey, children, sx }) {
  return (
    <ViewTransition key={contentKey} update="none">
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "row",
          ...sx,
        }}
      >
        {children}
      </Box>
    </ViewTransition>
  );
}
