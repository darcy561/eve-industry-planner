import { Box, Slider, Typography } from "@mui/material";
import {
  appShellInsetSurfaceSx,
  appShellSliderSx,
} from "../../Context/appShell";

/**
 * Window selector over an ordered row set, as an index range matching the chart
 * axis: older left, newer right.
 *
 * @param {Object} props
 * @param {[number, number]} props.value - inclusive [start, end] indices
 * @param {(range: [number, number]) => void} props.onChange
 * @param {number} props.count - total rows the range indexes into
 * @param {(index: number) => string} [props.formatThumb]
 * @param {string} props.title
 * @param {string} [props.description]
 * @param {boolean} [props.disabled]
 */
export function ChartRangeSlider({
  value,
  onChange,
  count,
  formatThumb,
  title,
  description,
  disabled,
}) {
  const handleChange = (_event, next) => {
    const last = Math.max(0, count - 1);
    let [a, b] = [Math.round(Number(next[0])), Math.round(Number(next[1]))];
    a = Math.max(0, Math.min(a, last));
    b = Math.max(0, Math.min(b, last));
    onChange(a > b ? [b, a] : [a, b]);
  };

  return (
    <Box
      sx={(t) => ({
        ...appShellInsetSurfaceSx(t),
        flex: 1,
        minWidth: 0,
        px: { xs: 2, md: 2.5 },
        py: { xs: 1, md: 1.25 },
        overflow: "hidden",
      })}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {title}
      </Typography>
      {description && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 1 }}
        >
          {description}
        </Typography>
      )}
      <Slider
        value={value}
        onChange={handleChange}
        valueLabelDisplay="auto"
        valueLabelFormat={formatThumb}
        min={0}
        max={Math.max(count - 1, 0)}
        step={1}
        orientation="horizontal"
        disabled={disabled || count === 0}
        sx={(t) => ({ ...appShellSliderSx(t), mt: 0.5, mb: 0 })}
      />
    </Box>
  );
}

/**
 * Inclusive index range covering the trailing `windowSize` rows.
 * Callers re-derive this when the data identity changes, so a window never
 * points into rows that have been replaced.
 */
export function trailingRange(count, windowSize) {
  if (!count) return [0, 0];
  const last = count - 1;
  return [Math.max(0, count - Math.min(windowSize, count)), last];
}

export default ChartRangeSlider;
