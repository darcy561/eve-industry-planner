import { useMemo, useState } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Box, Typography } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore"

/**
 * A data grid component for displaying EVE Online market order data.
 * Shows both sell and buy orders in separate grids with sorting capabilities.
 * 
 * @param {Object} props - Component props
 * @param {Array} [props.marketData=[]] - Array of market order objects containing order data
 * @param {Object} [props.alternativeRegionData={}] - Alternative region data for location lookups
 * @param {boolean} [props.isLoading=true] - Loading state for the data grids
 * @returns {JSX.Element} Market data display grid component
 * 
 * @example
 * <MarketDataDisplayGrid 
 *   marketData={marketOrders}
 *   alternativeRegionData={regionData}
 *   isLoading={false}
 * />
 */
function MarketDataDisplayGrid({
  marketData = [],
  alternativeRegionData = {},
  isLoading = true,
}) {
  const [sellSortModel, setSellSortModel] = useState([
    { field: "price", sort: "asc" },
  ]);
  const [buySortModel, setBuySortModel] = useState([
    { field: "price", sort: "desc" },
  ]);
  const findUniverseData = useUsersStore.getState().worldData.actions.findUniverseData

  const sellOrders = marketData.filter((order) => !order.is_buy_order);
  const buyOrders = marketData.filter((order) => order.is_buy_order);

  const maxPrice = useMemo(() => {
    return Math.max(...marketData.map((order) => order.price));
  }, [marketData]);

  const handleSellSortChange = (newSortModel) => {
    setSellSortModel(newSortModel);
  };

  const handleBuySortChange = (newSortModel) => {
    setBuySortModel(newSortModel);
  };

  const sellColumns = [
    {
      field: "system_id",
      headerName: "System",
      type: "string",
      flex: 0,
      valueGetter: (id) =>
        findUniverseData(id, alternativeRegionData)?.name ??
        "Unknown System",
    },
    {
      field: "volume_remain",
      headerName: "Remaining",
      type: "number",
      flex: 0,
    },
    {
      field: "price",
      headerName: "Price",
      type: "number",
      width: Math.max(maxPrice.toString().length * 10, 150),
      align: "right",
    },
    {
      field: "location_id",
      headerName: "Location",
      type: "string",
      flex: 1,
      valueGetter: (id) =>
        findUniverseData(id, alternativeRegionData)?.name ??
        "Unknown Location",
    },
    {
      field: "range",
      headerName: "Range",
      type: "string",
      flex: 0,
      valueGetter: (value) => {
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      },
    },
  ];

  const buyColumns = [
    {
      field: "system_id",
      headerName: "System",
      type: "string",
      flex: 0,
      valueGetter: (id) =>
        findUniverseData(id, alternativeRegionData)?.name ??
        "Unknown System",
    },

    {
      field: "volume_remain",
      headerName: "Remaining Quantity",
      type: "number",
      flex: 0,
    },
    {
      field: "price",
      headerName: "Price Per Unit",
      type: "number",
      width: Math.max(maxPrice.toString().length * 10, 150),
      align: "right",
    },
    {
      field: "location_id",
      headerName: "Location",
      type: "string",
      flex: 1,
      valueGetter: (id) =>
        findUniverseData(id, alternativeRegionData)?.name ??
        "Unknown Location",
    },
    {
      field: "range",
      headerName: "Range",
      type: "string",
      flex: 0,
      valueGetter: (value) => {
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      },
    },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%"
      }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "45%"
        }}>
        <Typography variant="h6" color="primary" component="h3" gutterBottom>
          Sell Orders
        </Typography>
        <Box
          sx={{
            display: "flex",
            overflow: "hidden"
          }}>
          <DataGrid
            loading={isLoading}
            rows={sellOrders}
            columns={sellColumns}
            getRowId={(row) => row.order_id}
            columnHeaderHeight={25}
            disableColumnMenu
            scrollbarSize={8}
            rowHeight={20}
            hideFooter
            disableSelectionOnClick
            disableRowSelectionOnClick
            sortModel={sellSortModel}
            onSortModelChange={handleSellSortChange}
            sx={{
              height: "100%",
              width: "100%",
              border: "1px solid lightgray",
            }}
          />
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "45%"
        }}>
        <Typography variant="h6" color="primary" component="h3" gutterBottom>
          Buy Orders
        </Typography>
        <Box
          sx={{
            display: "flex",
            overflow: "hidden"
          }}>
          <DataGrid
            loading={isLoading}
            rows={buyOrders}
            columns={buyColumns}
            getRowId={(row) => row.order_id}
            columnHeaderHeight={25}
            disableColumnMenu
            scrollbarSize={8}
            rowHeight={20}
            hideFooter
            disableSelectionOnClick
            disableRowSelectionOnClick
            sortModel={buySortModel}
            onSortModelChange={handleBuySortChange}
            stripedRows
            sx={{
              height: "100%",
              width: "100%",
              border: "1px solid lightgray",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default MarketDataDisplayGrid;
