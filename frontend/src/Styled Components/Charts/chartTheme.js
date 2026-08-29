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

/** Resolves a series colour, honouring an explicit one before falling back. */
export function resolveSeriesColour(theme, series, index) {
  if (series?.colour) return series.colour;
  const palette = chartSeriesColours(theme);
  return palette[index % palette.length];
}

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
