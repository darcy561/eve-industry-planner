export function getJobTreeFlowCanvasSx(theme, minHeight) {
  return {
    flex: 1,
    minHeight,
    width: "100%",
    position: "relative",
    bgcolor: "transparent",
    "& .react-flow": {
      backgroundColor: "transparent",
      "--xy-background-color": "transparent",
    },
    "& .react-flow__attribution": {
      display: "none",
    },
    "& .react-flow__controls": {
      boxShadow: theme.shadows[2],
    },
    "& .react-flow__controls-button": {
      backgroundColor: theme.palette.background.paper,
      borderBottom: `1px solid ${theme.palette.divider}`,
      "&:last-of-type": {
        borderBottom: "none",
      },
    },
    "& .react-flow__controls-button svg": {
      fill: theme.palette.primary.main,
      stroke: theme.palette.primary.main,
      maxHeight: 16,
      maxWidth: 16,
    },
    "& .react-flow__controls-button:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    "& .react-flow__controls-button:hover svg": {
      fill: theme.palette.secondary.main,
      stroke: theme.palette.secondary.main,
    },
    "@keyframes jobDependencyEdgePulse": {
      "0%, 100%": { strokeOpacity: 0.68 },
      "50%": { strokeOpacity: 1 },
    },
    "@keyframes jobDependencyNodeRingPulse": {
      "0%, 100%": { opacity: 0.68 },
      "50%": { opacity: 1 },
    },
    "@keyframes jobDependencyNodeEdgeShimmer": {
      "0%": { transform: "translateX(-105%)" },
      "100%": { transform: "translateX(260%)" },
    },
    "@media (prefers-reduced-motion: reduce)": {
      "& .react-flow__edge.job-dependency-edge--pulse .react-flow__edge-path": {
        animation: "none",
      },
      "& .job-dependency-node__pulse-ring": { animation: "none" },
      "& .job-dependency-node__edge-sweep-bar": { animation: "none" },
    },
    "& .react-flow__edge.job-dependency-edge--pulse .react-flow__edge-path": {
      animation: "jobDependencyEdgePulse 1.6s ease-in-out infinite",
    },
    "& .job-dependency-node__pulse-ring": {
      animation: "jobDependencyNodeRingPulse 1.6s ease-in-out infinite",
    },
  };
}
