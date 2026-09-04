import {
  Box,
  FormHelperText,
  MenuItem,
  Select,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import GLOBAL_CONFIG from "../../global-config-app";
import {
  appShellInsetSurfaceSx,
  getAppShellMarketSelectProps,
  MARKET_HUB_HISTORY_HELPER_TEXT,
} from "../../Context/appShell";
import { normalizeLocaleForIntl } from "../../Functions/Helper/localeDetection";
import { useItemNames } from "../../Hooks/useItemNames";
import useUsersStore from "../../Zustand/usersStore";
import { ChartRangeSlider, trailingRange } from "../Charts/ChartRangeSlider";
import { TimeSeriesChart } from "../Charts/TimeSeriesChart";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

function PriceHistoryItemName({ typeID }) {
  const rows = useMemo(() => (typeID ? [{ typeID }] : []), [typeID]);
  const names = useItemNames(rows);

  if (!typeID) return "No Item Selected";
  return names[typeID] ?? "Loading…";
}

/**
 * Price history for an EVE item: high/low bands, an average line, and traded
 * volume on its own axis, with a window selector and a region picker.
 *
 * @param {Object} props
 * @param {Array} props.graphData - historical price rows, oldest first
 * @param {number} props.typeID
 * @param {number} props.regionID
 * @param {Function} props.updateRegionID
 * @param {Object} [props.alternativeRegionData]
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
  /** Inclusive `[oldestIdx, newestIdx]` into graphData, matching the X axis. */
  const [visibleIndexRange, setVisibleIndexRange] = useState([0, 0]);
  const userLocale = normalizeLocaleForIntl(
    navigator.language || GLOBAL_CONFIG.DEFAULT_LOCALE,
  );

  const rowCount = graphData?.length ?? 0;
  // Reset the window when the series itself changes, or it would point into
  // rows belonging to a different item or region.
  const seriesIdentity =
    rowCount > 0
      ? `${rowCount}:${String(graphData[0]?.date)}:${String(graphData[rowCount - 1]?.date)}`
      : "";
  useLayoutEffect(() => {
    setVisibleIndexRange(trailingRange(rowCount, isMobile ? 7 : 30));
  }, [seriesIdentity, rowCount, isMobile]);

  const regionName =
    useUsersStore
      .getState()
      .worldData.actions.findUniverseData(regionID, alternativeRegionData)
      ?.name || "Unknown Region";

  const filteredData = useMemo(() => {
    if (!rowCount || visibleIndexRange[1] < visibleIndexRange[0]) return [];
    return graphData.slice(visibleIndexRange[0], visibleIndexRange[1] + 1);
  }, [graphData, rowCount, visibleIndexRange]);

  const formatDate = (value) =>
    new Intl.DateTimeFormat(userLocale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(value));

  const formatThumbDate = (index) => {
    const row = graphData?.[Math.round(Number(index))];
    return row?.date ? formatDate(row.date) : "";
  };

  const series = [
    {
      key: "highest",
      label: "High",
      type: "area",
      colour: "#f03939",
      fillOpacity: 0.1,
    },
    {
      key: "lowest",
      label: "Low",
      type: "area",
      colour: "#f5b43b",
      fillOpacity: 0.3,
    },
    {
      key: "average",
      label: "Average",
      type: "line",
      colour: theme.palette.primary.main,
    },
    {
      key: "volume",
      label: "Volume",
      type: "bar",
      colour: theme.palette.secondary.main,
      axis: "right",
      fillOpacity: 0.2,
    },
  ];

  // Axes scale to the visible window rather than from zero, so a narrow price
  // band stays readable instead of flattening against the axis.
  const iskDomain = filteredData.length
    ? [
        Math.min(...filteredData.map((d) => d.lowest)),
        Math.max(...filteredData.map((d) => d.highest)),
      ]
    : [0, 1];
  const volumeDomain = filteredData.length
    ? [
        Math.min(...filteredData.map((d) => d.volume)),
        Math.max(...filteredData.map((d) => d.volume)),
      ]
    : [0, 1];

  const formatAxisNumber = (tick) =>
    new Intl.NumberFormat(userLocale).format(tick);

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: "100%",
        flex: 1,
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
        sx={{
          width: "100%",
          maxWidth: "100%",
          flex: 1,
          minHeight: 320,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {filteredData.length > 0 && (
          <TimeSeriesChart
            rows={filteredData}
            categoryKey="date"
            series={series}
            formatCategory={formatDate}
            formatAxisTick={formatAxisNumber}
            leftAxisLabel="ISK"
            rightAxisLabel="Volume"
            leftDomain={iskDomain}
            rightDomain={volumeDomain}
            categoryAngle={-20}
            showGrid={false}
            axisProps={{ stroke: theme.palette.text.secondary }}
            tooltipProps={{
              contentStyle: {
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                color: theme.palette.text.primary,
                borderRadius: 4,
                padding: "10px",
                maxWidth: "min(420px, calc(100vw - 48px))",
                whiteSpace: "normal",
                wordBreak: "break-word",
              },
            }}
            style={{
              height: "100%",
              maxHeight: "none",
              aspectRatio: "auto",
              minHeight: 320,
            }}
          />
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
          pt: 1.5,
          borderTop: (t) => `1px solid ${alpha(t.palette.primary.main, 0.2)}`,
        }}
      >
        <ChartRangeSlider
          value={visibleIndexRange}
          onChange={setVisibleIndexRange}
          count={rowCount}
          formatThumb={formatThumbDate}
          title="Visible history — older left, newer right"
        />
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
            {rowCount && filteredData.length
              ? `From ${formatDate(filteredData[0].date)} through ${formatDate(filteredData[filteredData.length - 1].date)}`
              : "No history loaded for this range."}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default PriceHistoryLineGraph;
