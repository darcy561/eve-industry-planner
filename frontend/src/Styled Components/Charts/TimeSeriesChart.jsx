import { useTheme } from "@mui/material/styles";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartAxisProps,
  chartMargins,
  chartTooltipProps,
  formatAxisValue,
  formatTooltipValue,
  resolveSeriesColour,
} from "./chartTheme";

/**
 * Draws rows against a category axis. Takes data and a series description, never
 * a query result, so the same component draws profit by month, cost by item, or
 * extras by category.
 *
 * @param {Object} props
 * @param {Array<Object>} props.rows
 * @param {string} props.categoryKey - row field for the category axis
 * @param {Array<{key: string, label: string, type?: 'bar'|'line'|'area', colour?: string, axis?: 'left'|'right', fillOpacity?: number}>} props.series
 * @param {(value: any) => string} [props.formatCategory]
 * @param {(value: any) => string} [props.formatValue]
 * @param {(value: any) => string} [props.formatCategoryLabel] - tooltip heading
 * @param {(value: any) => string} [props.formatAxisTick] - axis ticks; defaults to short text
 * @param {string} [props.leftAxisLabel]
 * @param {[number, number]} [props.leftDomain] - defaults to recharts' own scaling
 * @param {[number, number]} [props.rightDomain]
 * @param {number} [props.categoryAngle] - rotate category labels when they are long
 * @param {Object} [props.style] - CSS sizing; defaults to full width at a fixed
 *   aspect ratio, so the chart follows the width of the page it is on
 * @param {string} [props.rightAxisLabel]
 */
export function TimeSeriesChart({
  rows = [],
  categoryKey,
  series = [],
  formatCategory,
  formatValue = formatTooltipValue,
  formatCategoryLabel,
  formatAxisTick = formatAxisValue,
  leftAxisLabel,
  rightAxisLabel,
  leftDomain,
  rightDomain,
  categoryAngle,
  style,
  width,
  height,
}) {
  const theme = useTheme();
  const axisProps = chartAxisProps(theme);
  const hasRightAxis = series.some((s) => s.axis === "right");

  return (
    <ComposedChart
      responsive
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
      data={rows}
      margin={chartMargins(rows, categoryKey, {
        formatCategory,
        angle: categoryAngle,
      })}
      style={{ width: "100%", aspectRatio: 1.9, ...style }}
    >
      <CartesianGrid stroke={theme.palette.divider} vertical={false} />
      <XAxis
        dataKey={categoryKey}
        tickFormatter={formatCategory}
        interval="preserveStartEnd"
        {...(categoryAngle ? { angle: categoryAngle, textAnchor: "end" } : {})}
        {...axisProps}
      />
      <YAxis
        width="auto"
        tickFormatter={formatAxisTick}
        domain={leftDomain}
        label={
          leftAxisLabel
            ? { value: leftAxisLabel, position: "top", offset: 15 }
            : undefined
        }
        {...axisProps}
      />
      {hasRightAxis && (
        <YAxis
          yAxisId="right"
          orientation="right"
          width="auto"
          tickFormatter={formatAxisTick}
          domain={rightDomain}
          label={
            rightAxisLabel
              ? { value: rightAxisLabel, position: "top", offset: 12 }
              : undefined
          }
          {...axisProps}
        />
      )}
      <Tooltip
        {...chartTooltipProps(theme)}
        formatter={(value, name) => [formatValue(value), name]}
        labelFormatter={formatCategoryLabel ?? formatCategory}
      />
      {series.length > 1 && <Legend position="top" />}
      {series.map((s, index) => {
        const colour = resolveSeriesColour(theme, s, index);
        const shared = {
          dataKey: s.key,
          name: s.label,
          ...(s.axis === "right" ? { yAxisId: "right" } : {}),
        };
        if (s.type === "line") {
          return (
            <Line
              key={s.key}
              {...shared}
              type="monotone"
              stroke={colour}
              dot={false}
              activeDot
            />
          );
        }
        if (s.type === "area") {
          return (
            <Area
              key={s.key}
              {...shared}
              type="monotone"
              stroke={colour}
              fill={colour}
              fillOpacity={s.fillOpacity ?? 0.2}
            />
          );
        }
        return (
          <Bar
            key={s.key}
            {...shared}
            fill={colour}
            fillOpacity={s.fillOpacity ?? 0.85}
          />
        );
      })}
    </ComposedChart>
  );
}

export default TimeSeriesChart;
