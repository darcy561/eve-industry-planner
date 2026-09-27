/**
 * Timing for every view transition the SPA runs, and the reduced-motion rule
 * that turns them all off, taken from the theme MUI's own transitions use.
 *
 * @param {Object} theme
 * @returns {Object}
 */
export function viewTransitionStyles(theme) {
  return {
    "::view-transition-old(*), ::view-transition-new(*)": {
      animationDuration: `${theme.transitions.duration.enteringScreen}ms`,
      animationTimingFunction: theme.transitions.easing.easeInOut,
    },
    "@media (prefers-reduced-motion: reduce)": {
      "::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*)":
        {
          animation: "none",
        },
    },
  };
}
