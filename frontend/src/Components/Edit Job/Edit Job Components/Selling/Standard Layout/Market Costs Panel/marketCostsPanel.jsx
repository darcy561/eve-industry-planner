import { Box, Typography, useMediaQuery, Grid } from "@mui/material";
import GLOBAL_CONFIG from "../../../../../../global-config-app";
import MarketHistoryIconButton from "../../../../../../Styled Components/IconButton/marketHistory";
import MarketDataIconButton from "../../../../../../Styled Components/IconButton/marketData";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

export function MarketCostsPanel({ state }) {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const itemCosts = useUsersStore
    .getState()
    .worldData.actions.findMarketData(state.activeJob.itemID);

  return (
    <ContentPanel title="Current Market Prices" componentName="Market Costs Panel" paperSx={{ position: "relative" }}>
      <Box
        sx={{
          position: "absolute",
          top: 1,
          right: 1,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 1,
        }}
      >
        <MarketHistoryIconButton itemTypeID={state.activeJob.itemID} />
        <MarketDataIconButton itemTypeID={state.activeJob.itemID} />
      </Box>
      <Grid container width="100%">

        {MARKET_OPTIONS.map(({ id, name }) => {
          const optionCosts = itemCosts[id];
          return (
            <Grid
              container
              align="center"
              key={id}
              size={{
                xs: 12,
                sm: 6,
                md: 3
              }}>
              <Grid
                size={{
                  xs: 12,
                  sm: 2
                }}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  {name}
                </Typography>
              </Grid>
              <Grid
                size={{
                  xs: 12,
                  sm: 10
                }}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Sell:{" "}
                  {itemCosts ? formatNumberForLocale(optionCosts.sell) : 0}
                </Typography>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Buy: {itemCosts ? formatNumberForLocale(optionCosts.buy) : 0}
                </Typography>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
    </ContentPanel>
  );
}
