import { Box, ToggleButtonGroup, ToggleButton, useMediaQuery } from "@mui/material";
import MarketLocationSelect from "../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../Styled Components/Select/marketListing";

function OptionsPanel({
  pageState,
  pageActions,
}) {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("md"));

  return (
    <Box
      display="flex"
      flexDirection={{ xs: "column", md: "row" }}
      justifyContent={{ xs: "flex-start", md: "space-between" }}
      alignItems={{ xs: "stretch", md: "center" }}
      width="100%"
      height="100%"
      gap={{ xs: 2, md: 0 }}
    >
      <Box 
        display="flex" 
        flexDirection="row" 
        alignItems="center" 
        justifyContent={{ xs: "center", md: "flex-start" }}
        gap={2}
        sx={{ order: { xs: 1, md: 1 } }}
      >
        <ToggleButtonGroup
          value={pageState.toMinerals}
          exclusive
          onChange={() => {
            pageActions.setInputText("");
            pageActions.setReprocessingObjects([]);
            pageActions.setProcessedInput([]);
            pageActions.toggleToMinerals();
          }}
          aria-label="Mineral Direction"
          sx={{}}
        >
          <ToggleButton
            size="small"
            value={true}
            sx={{
              fontSize: { xs: "0.75rem", md: "0.875rem" },
              padding: { xs: "4px 8px", md: "6px 16px" },
              "&.Mui-selected": {
                backgroundColor: "primary.main",
                color: "white",
              },
            }}
          >
            To Minerals
          </ToggleButton>
          <ToggleButton
            size="small"
            value={false}
            sx={{
              fontSize: { xs: "0.75rem", md: "0.875rem" },
              padding: { xs: "4px 8px", md: "6px 16px" },
              "&.Mui-selected": {
                backgroundColor: "primary.main",
                color: "white",
              },
            }}
          >
            From Minerals
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        sx={{ 
          flexGrow: { xs: 0, md: 1 },
          order: { xs: 2, md: 2 }
        }}
      >
        {pageState.toMinerals && (
          <ToggleButtonGroup
            value={pageState.displayAdvancedView}
            exclusive
            onChange={() => pageActions.toggleDisplayAdvancedView()}
            aria-label="View"
            sx={{ justifyContent: "center" }}
          >
            <ToggleButton
              size="small"
              value={false}
              sx={{
                fontSize: { xs: "0.75rem", md: "0.875rem" },
                padding: { xs: "4px 8px", md: "6px 16px" },
                "&.Mui-selected": {
                  backgroundColor: "primary.main",
                  color: "white",
                },
              }}
            >
              Basic View
            </ToggleButton>
            <ToggleButton
              size="small"
              value={true}
              sx={{
                fontSize: { xs: "0.75rem", md: "0.875rem" },
                padding: { xs: "4px 8px", md: "6px 16px" },
                "&.Mui-selected": {
                  backgroundColor: "primary.main",
                  color: "white",
                },
              }}
            >
              Advanced View
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      <Box
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent={{ xs: "center", md: "center" }}
        gap={2}
        sx={{
          order: { xs: 3, md: 3 },
          flexWrap: { xs: "wrap", md: "nowrap" }
        }}
      >
        <MarketLocationSelect
          value={pageState.marketLocation}
          onChange={({ id }) => pageActions.setMarketLocation(id)}
          customFormStyling={{
            width: "auto",
            minWidth: 120,
          }}
        />
        <MarketListingSelect
          value={pageState.marketListing}
          onChange={({ id }) => pageActions.setMarketListing(id)}
          customFormStyling={{
            width: "auto",
            minWidth: 120,
          }}
        />
      </Box>
    </Box>
  );
}

export default OptionsPanel;
