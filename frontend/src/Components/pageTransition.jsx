import { Box, Fade } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useRouterState } from "@tanstack/react-router";

/**
 * Key identifying the full-page view on screen.
 *
 * The route pattern, not the resolved path: changing a param (opening a child
 * job from an open one) updates the page in place rather than swapping it.
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
 * Fades full-page content in when `contentKey` changes.
 *
 * Only the incoming content is rendered — a page being left is unmounted at
 * once, so its effects and locks are released on navigation rather than being
 * held alive for the length of a fade.
 *
 * Each page gets its own surface, keyed on the page it holds, and fades in from
 * hidden. Sharing one surface across the swap gives the arriving page the
 * opacity the page before it left behind, so the only way to a hidden frame is
 * to animate the new page *out* — which paints it, takes it away, and brings it
 * back. On a heavy page that reads as a slow flash, because the work of mounting
 * it delays whatever was meant to bring it back.
 *
 * @param {Object} props
 * @param {string} props.contentKey Changing this restarts the fade.
 * @param {React.ReactNode} props.children
 * @param {import("@mui/material").SxProps} [props.sx]
 */
export default function PageTransition({ contentKey, children, sx }) {
  const theme = useTheme();

  return (
    <Fade
      key={contentKey}
      in
      appear
      timeout={theme.transitions.duration.enteringScreen}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          // Row: pages place a side drawer beside their main content.
          flexDirection: "row",
          ...sx,
        }}
      >
        {children}
      </Box>
    </Fade>
  );
}
