import { useTheme } from "@mui/material/styles";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartAxisProps,
  chartGridStroke,
  chartTooltipProps,
  formatAxisValue,
  formatTooltipValue,
  resolveSeriesColour,
} from "./chartTheme";

/**
 * Horizontal bars for a ranked page of rows. Draws the order it was given;
 * ranking is the server's, so rows are never re-sorted here.
 *
 * @param {Object} props
 * @param {Array<Object>} props.rows
 * @param {string} props.categoryKey - row field naming each bar
 * @param {string} props.valueKey - row field for the bar length
 * @param {string} [props.valueLabel]
 * @param {(value: any) => string} [props.formatValue]
 * @param {number} [props.barHeight=28] - row height; the chart grows with its rows
 * @param {Object} [props.style] - CSS sizing overrides
 * @param {string} [props.colour]
 * @param {(row: Object) => string} [props.colourFor] - per-bar colour
 */
export function RankedBarChart({
  rows = [],
  categoryKey,
  valueKey,
  valueLabel,
  formatValue = formatTooltipValue,
  barHeight = 28,
  colour,
  colourFor,
  style,
  width,
  height,
}) {
  const theme = useTheme();
  const axisProps = chartAxisProps(theme);
  const baseColour = colour ?? resolveSeriesColour(theme, null, 0);
  const rowsHeight =
    height ?? Math.min(320, Math.max(160, rows.length * barHeight + 48));

  return (
    <BarChart
      responsive
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
      style={{ width: "100%", height: rowsHeight, ...style }}
      data={rows}
      layout="vertical"
      margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
    >
      <CartesianGrid stroke={chartGridStroke(theme)} horizontal={false} />
      <XAxis type="number" tickFormatter={formatAxisValue} {...axisProps} />
      <YAxis
        type="category"
        dataKey={categoryKey}
        width="auto"
        {...axisProps}
      />
      <Tooltip
        {...chartTooltipProps(theme)}
        formatter={(value) => [formatValue(value), valueLabel ?? valueKey]}
      />
      <Bar
        dataKey={valueKey}
        name={valueLabel ?? valueKey}
        fill={baseColour}
        fillOpacity={0.85}
        shape={
          colourFor
            ? (props) => (
                <Rectangle {...props} fill={colourFor(props?.payload)} />
              )
            : undefined
        }
      />
    </BarChart>
  );
}

export default RankedBarChart;
