import { useRef } from "react";
import { Alert, Collapse } from "@mui/material";
import { useArchiveTimeline } from "./useArchiveTimeline";

/** A state with no entry here says nothing, rather than an alert with no words in it. */
const NOTICES = {
  recalculating: {
    severity: "info",
    text: "Your statistics are being rebuilt. The figures here are the previous ones until it finishes.",
  },
  failed: {
    severity: "warning",
    text: "A statistics rebuild could not be completed, so these figures are out of date.",
  },
};

/**
 * Says when the figures on the page are known to be behind.
 *
 * Takes the page's window so it reads the response the panels already have; the
 * state rides on every statistics response.
 */
export function RecalculationNotice({ from, to, range }) {
  const { recalculation } = useArchiveTimeline({ from, to, range });
  const notice = (recalculation && NOTICES[recalculation]) || null;
  // Held so the alert still reads while it collapses away.
  const last = useRef(null);
  if (notice) last.current = notice;
  const shown = notice ?? last.current;

  return (
    <Collapse in={Boolean(notice)} unmountOnExit>
      <Alert severity={shown?.severity ?? "info"} variant="outlined">
        {shown?.text}
      </Alert>
    </Collapse>
  );
}
