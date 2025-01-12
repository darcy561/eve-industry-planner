import {
  Box,
  Select,
  Slider,
  Typography,
  useTheme,
  MenuItem,
  useMediaQuery,
} from "@mui/material";
import { useEffect, useState } from "react";
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
import getItemNameFromTypeID from "../../Functions/Helper/getItemNameFromTypeID";
import { useHelperFunction } from "../../Hooks/GeneralHooks/useHelperFunctions";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

function PriceHistoryLineGraph({
  graphData,
  typeID,
  regionID,
  updateRegionID,
  alternativeRegionData,
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [dateRange, setDateRange] = useState([0, 30]);
  const { findUniverseItemObject } = useHelperFunction();
  const userLocale = navigator.language || "en-US";

  useEffect(() => {
    if (isMobile) {
      setDateRange([0, 7]);
    } else {
      setDateRange([0, 30]);
    }
  }, [isMobile]);

  const itemName = getItemNameFromTypeID(typeID);
  const regionName =
    findUniverseItemObject(regionID, alternativeRegionData)?.name ||
    "Unknown Region";

  const filteredData = graphData
    ? graphData.slice(
        graphData.length - dateRange[1] - 1,
        graphData.length - dateRange[0]
      )
    : [];

  const minISK = Math.min(...filteredData.map((d) => d.lowest));
  const maxISK = Math.max(...filteredData.map((d) => d.highest));
  const minVolume = Math.min(...filteredData.map((d) => d.volume));
  const maxVolume = Math.max(...filteredData.map((d) => d.volume));

  const handleSliderChange = (event, newValue) => {
    setDateRange(newValue);
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

  const formatTooltipNumber = (number) => {
    return new Intl.NumberFormat(userLocale).format(number);
  };

  const longestYAxisTickISK = formatYAxisTicks(maxISK).length;
  const longestYAxisTickVolume = formatYAxisTicks(maxVolume).length;
  const longestXAxisTick = filteredData.reduce((longest, item) => {
    const formattedDate = formatXAxisDates(item.date).length;
    return Math.max(longest, formattedDate);
  }, 0);
  const dynamicMargins = {
    top: 10,
    right: longestYAxisTickVolume * 5,
    bottom: longestXAxisTick * 5,
    left: longestYAxisTickISK * 5,
  };

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 2,
        }}
      >
        <Typography variant="h6" color="primary">
          Price History For {itemName} in {regionName}
        </Typography>
        <Box sx={{ width: "200px" }}>
          <Select
            variant="standard"
            size="small"
            value={regionID}
            onChange={(e) => updateRegionID(e.target.value)}
            fullWidth
          >
            {MARKET_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.regionID}>
                {option.name}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      <Box sx={{ width: "100%", height: "80%" }}>
        <ResponsiveContainer width="100%" height="100%">
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
              contentStyle={{
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                color: theme.palette.text.primary,
                borderRadius: 4,
                padding: "10px",
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
      </Box>

      <Box
        sx={{ width: "100%", display: "flex", alignItems: "center", gap: 2 }}
      >
        <Box sx={{ width: "50%", padding: 2 }}>
          <Typography gutterBottom>Filter by Date Range (Days)</Typography>
          <Slider
            value={dateRange}
            onChange={handleSliderChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `Day ${value}`}
            min={0}
            max={graphData ? graphData.length - 1 : 0}
            step={1}
            orientation="horizontal"
          />
        </Box>
        <Box>
          <Typography variant="body2" color="textSecondary">
            Displaying data from Day {dateRange[0]} to Day {dateRange[1]}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default PriceHistoryLineGraph;
