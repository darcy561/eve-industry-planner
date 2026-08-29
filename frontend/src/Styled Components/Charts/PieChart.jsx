import { useTheme } from "@mui/material/styles";
import {
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  Sector,
  Tooltip,
} from "recharts";
import {
  chartLegendProps,
  chartTooltipProps,
  formatTooltipValue,
  resolveSeriesColour,
} from "./chartTheme";

/**
 * Share of a total across a small set of slices.
 *
 * @param {Object} props
 * @param {Array<Object>} props.rows
 * @param {string} props.categoryKey
 * @param {string} props.valueKey
 * @param {(value: any) => string} [props.formatValue]
 * @param {Object} [props.style] - CSS sizing overrides
 */
export function PieChart({
  rows = [],
  categoryKey,
  valueKey,
  formatValue = formatTooltipValue,
  style,
  width,
  height,
}) {
  const theme = useTheme();

  return (
    <RechartsPieChart
      responsive
      {...(width ? { width } : {})}
      {...(height ? { height } : {})}
      style={{
        width: "100%",
        aspectRatio: 1.4,
        maxHeight: 320,
        ...style,
      }}
    >
      <Pie
        data={rows}
        dataKey={valueKey}
        nameKey={categoryKey}
        innerRadius="45%"
        outerRadius="75%"
        paddingAngle={2}
        shape={(props, index) => (
          <Sector
            {...props}
            fill={resolveSeriesColour(theme, props?.payload, index ?? 0)}
            stroke={theme.palette.background.default}
          />
        )}
      />
      <Tooltip
        {...chartTooltipProps(theme)}
        formatter={(value, name) => [formatValue(value), name]}
      />
      <Legend position="bottom" {...chartLegendProps(theme)} />
    </RechartsPieChart>
  );
}

export default PieChart;
