import { alpha } from "@mui/material/styles";

/**
 * Visual feedback for job-planner workflow stage droppables (job + group accordions).
 *
 * @param {import("@mui/material").Theme} theme
 * @param {{ activeDragPayload: object | null, isOver: boolean, canAcceptHere: boolean }} args
 */
export function plannerStageDropZoneSx(theme, { activeDragPayload, isOver, canAcceptHere }) {
  const dragging = Boolean(activeDragPayload);
  const rejectDrop = Boolean(activeDragPayload && isOver && !canAcceptHere);
  const canHint = Boolean(activeDragPayload && canAcceptHere && !isOver);
  const validOver = Boolean(activeDragPayload && canAcceptHere && isOver);
  const lifted = Boolean(canHint || validOver || rejectDrop);

  return {
    ...(lifted && {
      position: "relative",
      zIndex: 2,
      isolation: "isolate",
    }),
    ...(dragging && {
      borderRadius: 1,
      transition:
        "outline-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
    }),
    ...(canHint && {
      outline: `2px dashed ${alpha(theme.palette.primary.main, 0.55)}`,
      outlineOffset: -1,
      backgroundColor: alpha(theme.palette.primary.main, 0.08),
      boxShadow: `0 4px 18px ${alpha(theme.palette.primary.main, 0.14)}`,
      cursor: "alias",
      "& .MuiAccordionSummary-root": {
        cursor: "alias",
      },
    }),
    ...(validOver && {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -1,
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}, 0 8px 28px ${alpha(theme.palette.primary.main, 0.2)}`,
      backgroundColor: alpha(theme.palette.primary.main, 0.12),
      cursor: "copy",
      "& .MuiAccordionSummary-root": {
        cursor: "copy",
      },
    }),
    ...(rejectDrop && {
      outline: `2px dashed ${alpha(theme.palette.error.main, 0.65)}`,
      outlineOffset: -1,
      backgroundColor: alpha(theme.palette.error.main, 0.08),
      boxShadow: `0 4px 18px ${alpha(theme.palette.error.main, 0.16)}`,
      cursor: "no-drop",
      "& .MuiAccordionSummary-root": {
        cursor: "no-drop",
      },
    }),
    "& .MuiAccordionSummary-expandIconWrapper, & .MuiAccordionSummary-root .MuiIconButton-root":
      {
        cursor: "pointer !important",
      },
  };
}
