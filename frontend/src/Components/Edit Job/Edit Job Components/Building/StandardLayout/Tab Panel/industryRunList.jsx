import { Grid } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { IndustryRunCard } from "./industryRunCard";

/**
 * How long a row takes to fade out of the list, in milliseconds. It matches the
 * transition below, and is what keeps a row on screen for it.
 */
const LEAVING_MS = 800;

/**
 * The runs on one of the Building stage's tabs, and what pressing one means.
 *
 * Linking and unlinking happen when the card is pressed. The row it was on is
 * gone from the job the moment the write lands, so the list holds it for the
 * length of the fade rather than making the write wait for it — a reader who
 * presses and immediately closes the job keeps their change either way.
 *
 * @param {object} props
 * @param {Array<import("./runRows").RunRow>} props.rows
 * @param {string} props.tooltip - What pressing a card does, while it is allowed
 * @param {string} props.disabledTooltip - Why it cannot be pressed
 * @param {boolean} props.disabled
 * @param {(row: import("./runRows").RunRow) => void} props.onSelect
 */
export function IndustryRunList({
  rows,
  tooltip,
  disabledTooltip,
  disabled,
  onSelect,
}) {
  const [leaving, startLeaving] = useLeavingRows();

  const held = [...leaving.values()].filter(
    (row) => !rows.some((current) => current.key === row.key),
  );

  return (
    <Grid
      container
      spacing={2}
      sx={{
        marginBottom: "10px",
        overflowY: "auto",
        maxHeight: {
          xs: "350px",
          sm: "260px",
          md: "240px",
          lg: "240px",
          xl: "480px",
        },
        "& > .MuiGrid-item": {
          transition: `all ${LEAVING_MS}ms ease-in-out`,
          "&.clicked": {
            transform: "scale(0.95)",
            opacity: 0,
            height: 0,
            margin: 0,
            padding: 0,
            overflow: "hidden",
          },
        },
      }}
    >
      {[...rows, ...held].map((row) => {
        // A leaving row has had its press: the write landed, and it is drawn
        // only for the fade.
        const isLeaving = leaving.has(row.key);

        return (
          <Grid
            key={row.key}
            className={isLeaving ? "clicked" : ""}
            size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
          >
            <IndustryRunCard
              row={row}
              tooltip={isLeaving ? "" : disabled ? disabledTooltip : tooltip}
              disabled={disabled || isLeaving}
              onSelect={() => {
                startLeaving(row);
                onSelect(row);
              }}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}

/**
 * The rows that have been pressed and are fading out, and the way to start one.
 *
 * @returns {[Map<string, import("./runRows").RunRow>, (row: object) => void]}
 */
function useLeavingRows() {
  const [leaving, setLeaving] = useState(() => new Map());
  const timers = useRef(new Map());

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) clearTimeout(timer);
      running.clear();
    };
  }, []);

  const startLeaving = useCallback((row) => {
    setLeaving((previous) => new Map(previous).set(row.key, row));
    const timer = setTimeout(() => {
      timers.current.delete(row.key);
      setLeaving((previous) => {
        const next = new Map(previous);
        next.delete(row.key);
        return next;
      });
    }, LEAVING_MS);
    timers.current.set(row.key, timer);
  }, []);

  return [leaving, startLeaving];
}

export default IndustryRunList;
