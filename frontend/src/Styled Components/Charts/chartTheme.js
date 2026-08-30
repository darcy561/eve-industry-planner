import { alpha } from "@mui/material/styles";
import { appShellInsetSurfaceSx } from "../../Context/appShell";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../Functions/Helper/numberParser";

/**
 * Shared chart styling and formatting, so every chart on a page agrees without
 * each one re-deriving it.
 */

/** Series colours in assignment order, taken from the theme. */
export function chartSeriesColours(theme) {
  return [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.error.main,
  ];
}

/**
 * Colours for series that mean the same thing wherever they are drawn, so cost
 * reads as cost on every chart rather than taking whatever position it happens
 * to hold in the rotation.
 */
export function chartRoleColours(theme) {
  return {
    cost: theme.palette.warning.main,
    sales: theme.palette.info.main,
    profit: theme.palette.success.main,
    loss: theme.palette.error.main,
  };
}

/**
 * Resolves a series colour: an explicit one wins, then a named role, then the
 * rotation for series that carry no meaning beyond being distinct.
 */
export function resolveSeriesColour(theme, series, index) {
  if (series?.colour) return series.colour;
  if (series?.role) {
    const byRole = chartRoleColours(theme)[series.role];
    if (byRole) return byRole;
  }
  const palette = chartSeriesColours(theme);
  return palette[index % palette.length];
}

/**
 * Stamps each row with the colour its mark is drawn in. Recharts takes a legend
 * swatch from the entry's own `fill`, so colouring marks only in a shape renderer
 * draws correctly and legends grey.
 */
export function withSeriesColours(theme, rows = []) {
  return rows.map((row, index) => ({
    ...row,
    fill: resolveSeriesColour(theme, row, index),
  }));
}

/**
 * How a sector should be drawn given what the pointer is over.
 *
 * Matched by name, not position: `Legend` sorts its own items (`itemSorter`
 * defaults to `"value"`) while sectors keep data order, so the index a legend
 * event reports points at the wrong slice. `isActive` is the chart's own hover
 * state, so a mark and its key read the same.
 *
 * @param {{isActive?: boolean, name?: string, outerRadius?: number}} sector
 * @param {string|null} hoveredName - legend item under the pointer, or null
 */
export function sectorHighlight(sector, hoveredName) {
  const hovering = hoveredName !== null && hoveredName !== undefined;
  const active =
    Boolean(sector?.isActive) || (hovering && sector?.name === hoveredName);
  const dimmed = hovering && !active;
  const outerRadius = Number(sector?.outerRadius);
  return {
    active,
    fillOpacity: dimmed ? 0.35 : 1,
    outerRadius:
      active && Number.isFinite(outerRadius)
        ? outerRadius * HIGHLIGHT_GROWTH
        : sector?.outerRadius,
  };
}

/** How much a highlighted sector grows. Enough to read, not enough to reflow. */
const HIGHLIGHT_GROWTH = 1.06;

/** Axis ticks use short text; long ISK values would otherwise clip. */
export function formatAxisValue(value) {
  return numberToShortText(value);
}

/** Tooltips show the full figure. */
export function formatTooltipValue(value) {
  return formatNumberForLocale(value);
}

export function chartTooltipProps(theme) {
  const surface = appShellInsetSurfaceSx(theme);
  return {
    allowEscapeViewBox: { x: false, y: false },
    wrapperStyle: {
      maxWidth: "min(420px, calc(100vw - 48px))",
      zIndex: 2,
    },
    contentStyle: {
      backgroundColor: surface.backgroundColor,
      border: surface.border,
      color: theme.palette.text.primary,
      borderRadius: theme.shape.borderRadius * 2,
      padding: "10px",
      maxWidth: "min(420px, calc(100vw - 48px))",
      whiteSpace: "normal",
      wordBreak: "break-word",
      backdropFilter: "blur(3px)",
    },
    itemStyle: { color: theme.palette.text.primary },
    cursor: { fill: alpha(theme.palette.primary.main, 0.08) },
  };
}

export function chartAxisProps(theme) {
  return {
    stroke: alpha(theme.palette.primary.main, 0.35),
    tick: { fill: theme.palette.text.secondary, fontSize: 12 },
    tickLine: { stroke: alpha(theme.palette.primary.main, 0.35) },
  };
}

/** Grid lines, kept faint so they sit behind the marks rather than beside them. */
export function chartGridStroke(theme) {
  return alpha(theme.palette.primary.main, 0.12);
}

/**
 * Bottom margin sized to the longest drawn category label. The value axes size
 * themselves with width="auto"; rotated labels need more room than flat ones.
 */
export function chartMargins(
  rows,
  categoryKey,
  { formatCategory, angle } = {},
) {
  const longest = (rows ?? []).reduce((widest, row) => {
    const raw = row?.[categoryKey];
    const text = String(formatCategory ? formatCategory(raw) : (raw ?? ""));
    return text.length > widest ? text.length : widest;
  }, 0);
  // A rotated label occupies vertical space proportional to its length; a flat
  // one only needs room for a single line.
  const perChar = angle ? 5 : 2;
  return {
    top: 12,
    right: 16,
    bottom: Math.min(110, 24 + longest * perChar),
    left: 8,
  };
}

/** Legend type, matched to the panel's secondary text. */
export function chartLegendProps(theme) {
  return {
    wrapperStyle: {
      fontSize: 12,
      color: theme.palette.text.secondary,
    },
  };
}
