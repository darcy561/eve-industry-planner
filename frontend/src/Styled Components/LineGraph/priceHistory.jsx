import {
  Box,
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
  Slider,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  appShellInsetSurfaceSx,
  appShellSliderSx,
  getAppShellMarketSelectProps,
  MARKET_HUB_HISTORY_HELPER_TEXT,
} from "../../Context/appShell";
import { normalizeLocaleForIntl } from "../../Functions/Helper/localeDetection";
import getItemNameFromTypeID from "../../Functions/Helper/getItemNameFromTypeID";
import useUsersStore from "../../Zustand/usersStore";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

function computeDefaultVisibleRange(graphData, isMobile) {
  const n = graphData?.length ?? 0;
  if (n === 0) return [0, 0];
  const lastIdx = n - 1;
  const windowPoints = isMobile ? 7 : 30;
  const span = Math.min(windowPoints, n);
  const startIdx = Math.max(0, n - span);
  return [startIdx, lastIdx];
}

function PriceHistoryItemName({ typeID }) {
  const [name, setName] = useState(() =>
    typeID ? "Loading…" : "No Item Selected",
  );

  useEffect(() => {
    if (!typeID) {
      setName("No Item Selected");
      return;
    }
    let cancelled = false;
    setName("Loading…");
    getItemNameFromTypeID(typeID).then((resolved) => {
      if (!cancelled) setName(resolved ?? "Unknown Item");
    });
    return () => {
      cancelled = true;
    };
  }, [typeID]);

  return name;
}

/**
 * A comprehensive price history chart component for EVE Online items.
 * Displays historical pricing data with interactive controls for date range (slider matches the chart:
 * older on the left, newer on the right) and region selection.
 * Features area charts for high/low prices, line chart for average prices, and bar chart for volume.
 *
 * @param {Object} props - Component props
 * @param {Array} props.graphData - Array of historical price data objects
 * @param {number} props.typeID - EVE Online type ID of the item to display
 * @param {number} props.regionID - Market region ID for the data
 * @param {Function} props.updateRegionID - Callback function to update the selected region
 * @param {Object} [props.alternativeRegionData] - Alternative region data for lookups
 * @returns {JSX.Element} Price history line graph component
 *
 * @example
 * <PriceHistoryLineGraph
 *   graphData={priceHistoryData}
 *   typeID={34}
 *   regionID={10000002}
 *   updateRegionID={(regionId) => setRegion(regionId)}
 * />
 */
function PriceHistoryLineGraph({
  graphData,
  typeID,
  regionID,
  updateRegionID,
  alternativeRegionData,
}) {
  const theme = useTheme();
  const regionSelectShell = getAppShellMarketSelectProps(theme);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  /** Inclusive `[oldestIdx, newestIdx]` in `graphData` (same order as the X axis: older → newer). */
  const [visibleIndexRange, setVisibleIndexRange] = useState([0, 0]);
  const [containerDimensions, setContainerDimensions] = useState({
    width: 0,
    height: 0,
  });
  const userLocale = normalizeLocaleForIntl(
    navigator.language || GLOBAL_CONFIG.DEFAULT_LOCALE,
  );

  const historySeriesKey =
    graphData?.length > 0
      ? `${graphData.length}:${String(graphData[0]?.date)}:${String(graphData[graphData.length - 1]?.date)}`
      : "";

  const rangeResetKey = `${historySeriesKey}|${isMobile}`;
  useLayoutEffect(() => {
    setVisibleIndexRange(computeDefaultVisibleRange(graphData, isMobile));
  }, [rangeResetKey, graphData, isMobile]);

  const setChartContainerRef = useCallback((element) => {
    if (!element) {
      return;
    }
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setContainerDimensions({ width, height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(element);
    return () => {
      ro.disconnect();
    };
  }, []);

  const regionName =
    useUsersStore
      .getState()
      .worldData.actions.findUniverseData(regionID, alternativeRegionData)
      ?.name || "Unknown Region";

  const filteredData =
    graphData?.length && visibleIndexRange[1] >= visibleIndexRange[0]
      ? graphData.slice(visibleIndexRange[0], visibleIndexRange[1] + 1)
      : [];

  const minISK =
    filteredData.length > 0
      ? Math.min(...filteredData.map((d) => d.lowest))
      : 0;
  const maxISK =
    filteredData.length > 0
      ? Math.max(...filteredData.map((d) => d.highest))
      : 1;
  const minVolume =
    filteredData.length > 0
      ? Math.min(...filteredData.map((d) => d.volume))
      : 0;
  const maxVolume =
    filteredData.length > 0
      ? Math.max(...filteredData.map((d) => d.volume))
      : 1;

  const handleVisibleRangeChange = (_event, newValue) => {
    const n = graphData?.length ?? 0;
    const last = Math.max(0, n - 1);
    let a = Math.round(Number(newValue[0]));
    let b = Math.round(Number(newValue[1]));
    a = Math.max(0, Math.min(a, last));
    b = Math.max(0, Math.min(b, last));
    if (a > b) {
      setVisibleIndexRange([b, a]);
    } else {
      setVisibleIndexRange([a, b]);
    }
  };

  const formatYAxisTicks = (tick) => {
    return new Intl.NumberFormat(userLocale).format(tick);
  };

  const formatXAxisDates = (tick) => {
    const date = new Date(tick);
    return new Intl.DateTimeFormat(userLocale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(date);
  };

  const formatTooltipDate = (date) => {
    const formattedDate = new Date(date);
    return new Intl.DateTimeFormat(userLocale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(formattedDate);
  };

  const formatThumbDate = (dataIndex) => {
    const idx = Math.round(Number(dataIndex));
    const row = graphData?.[idx];
    if (!row?.date) return "";
    return new Intl.DateTimeFormat(userLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(row.date));
  };

  const formatTooltipNumber = (number) => {
    return new Intl.NumberFormat(userLocale).format(number);
  };

  const longestYAxisTickISK = formatYAxisTicks(maxISK).length;
  const longestYAxisTickVolume = formatYAxisTicks(maxVolume).length;
  const longestXAxisTick =
    filteredData.length > 0
      ? filteredData.reduce((longest, item) => {
          const formattedDate = formatXAxisDates(item.date).length;
          return Math.max(longest, formattedDate);
        }, 0)
      : 0;
  const dynamicMargins = {
    top: 10,
    right: longestYAxisTickVolume * 5,
    bottom: longestXAxisTick * 5,
    left: longestYAxisTickISK * 5,
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 2,
          paddingBottom: 2,
          flexShrink: 0,
          overflow: "visible",
        }}
      >
        <Typography
          variant="h6"
          color="primary"
          component="div"
          sx={{ flex: "1 1 240px", minWidth: 0 }}
        >
          Price History For{" "}
          <Box component="span" sx={{ display: "inline" }}>
            <PriceHistoryItemName typeID={typeID} />
          </Box>{" "}
          in {regionName}
        </Typography>
        <Box
          sx={{
            width: { xs: "100%", sm: 240 },
            flexShrink: 0,
            overflow: "visible",
            pt: 0.25,
          }}
        >
          <Select
            labelId="price-history-region-label"
            label="Market hub"
            variant="outlined"
            value={regionID ?? ""}
            onChange={(e) => updateRegionID(e.target.value)}
            fullWidth
            MenuProps={regionSelectShell.menuProps}
            inputProps={{ "aria-describedby": "price-history-region-helper" }}
            sx={{
              "& .MuiSelect-icon": { color: "primary.main" },
            }}
          >
            {MARKET_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.regionID}>
                {option.name}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText
            id="price-history-region-helper"
            variant="standard"
            sx={{
              ...regionSelectShell.customHelperTextStyling,
              mt: 0.5,
              lineHeight: 1.45,
              overflow: "visible",
              whiteSpace: "normal",
            }}
          >
            {MARKET_HUB_HISTORY_HELPER_TEXT}
          </FormHelperText>
        </Box>
      </Box>

      <Box
        ref={setChartContainerRef}
        sx={{
          width: "100%",
          maxWidth: "100%",
          flex: 1,
          minHeight: 400,
          minWidth: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {containerDimensions.width > 0 &&
          containerDimensions.height > 0 &&
          filteredData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%" minHeight={400}>
              <ComposedChart data={filteredData} margin={dynamicMargins}>
                <Area
                  type="monotone"
                  dataKey="highest"
                  stroke="#f03939"
                  fill="#f03939"
                  fillOpacity={0.1}
                />
                <Area
                  type="monotone"
                  dataKey="lowest"
                  stroke="#f5b43b"
                  fill="#f5b43b"
                  fillOpacity={0.3}
                />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke={theme.palette.primary.main}
                  dot={false}
                  activeDot
                />
                <Bar
                  dataKey={"volume"}
                  fill={theme.palette.secondary.main}
                  fillOpacity={0.2}
                  yAxisId="right"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxisDates}
                  angle={-20}
                  textAnchor="end"
                  interval={"preserveStartEnd"}
                />
                <YAxis
                  dataKey="average"
                  domain={[minISK, maxISK]}
                  tickFormatter={formatYAxisTicks}
                  label={{ value: "ISK", position: "top", offset: 15 }}
                />
                <YAxis
                  yAxisId="right"
                  dataKey={"volume"}
                  domain={[minVolume, maxVolume]}
                  orientation="right"
                  tickFormatter={formatYAxisTicks}
                  label={{
                    value: "Volume",
                    position: "top",
                    offset: 15,
                  }}
                />
                <Tooltip
                  allowEscapeViewBox={{ x: false, y: false }}
                  wrapperStyle={{
                    maxWidth: "min(420px, calc(100vw - 48px))",
                    zIndex: 2,
                  }}
                  contentStyle={{
                    backgroundColor: theme.palette.background.paper,
                    borderColor: theme.palette.divider,
                    color: theme.palette.text.primary,
                    borderRadius: 4,
                    padding: "10px",
                    maxWidth: "min(420px, calc(100vw - 48px))",
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                  }}
                  itemStyle={{
                    color: theme.palette.text.primary,
                  }}
                  labelFormatter={(label) => formatTooltipDate(label)}
                  formatter={(value) => formatTooltipNumber(value)}
                />
                <Legend verticalAlign="top" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
      </Box>

      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          alignItems: "stretch",
          gap: 2,
          flexShrink: 0,
          mt: "auto",
          pt: 2,
          borderTop: (t) => `1px solid ${alpha(t.palette.primary.main, 0.2)}`,
        }}
      >
        <Box
          sx={(t) => ({
            ...appShellInsetSurfaceSx(t),
            flex: 1,
            minWidth: 0,
            p: { xs: 2, md: 2.5 },
            overflow: "hidden",
          })}
        >
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Visible history (same as chart: older left, newer right)
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 1 }}
          >
            Drag the left handle to include or exclude older dates; drag the
            right handle toward the left to move the window back in time on the
            chart.
          </Typography>
          <Slider
            value={visibleIndexRange}
            onChange={handleVisibleRangeChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(idx) => formatThumbDate(idx)}
            min={0}
            max={Math.max((graphData?.length ?? 1) - 1, 0)}
            step={1}
            orientation="horizontal"
            disabled={!graphData?.length}
            sx={(t) => appShellSliderSx(t)}
          />
        </Box>
        <Box
          sx={(t) => ({
            ...appShellInsetSurfaceSx(t),
            display: "flex",
            alignItems: "center",
            px: { xs: 2, md: 2.5 },
            py: { xs: 2, md: 2 },
            alignSelf: { xs: "stretch", md: "center" },
            minHeight: { md: "100%" },
          })}
        >
          <Typography variant="body2" color="text.secondary">
            {graphData?.length && filteredData.length
              ? `From ${formatTooltipDate(filteredData[0].date)} through ${formatTooltipDate(filteredData[filteredData.length - 1].date)}`
              : "No history loaded for this range."}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default PriceHistoryLineGraph;
