import { Box, Typography, useMediaQuery, Grid } from "@mui/material";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";
import ItemMarketActions from "../../../../../../Styled Components/Item/marketActions";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { useMarketSources } from "../../../../../../Hooks/Static/useMarketSources";
import { getMarketPriceForType } from "../../../../../../Functions/MarketData/marketPriceForType";

export function MarketCostsPanel({ state }) {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const marketSources = useMarketSources();

  return (
    <ContentPanel
      title="Current Market Prices"
      componentName="Market Costs Panel"
      paperSx={{ position: "relative" }}
    >
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
        <ItemMarketActions
          typeID={state.activeJob.itemID}
          side={PRICING_SIDE.SELLING}
        />
      </Box>
      <Grid
        container
        sx={{
          width: "100%",
        }}
      >
        {marketSources.map(({ id, name }) => {
          const itemID = state.activeJob.itemID;
          return (
            <Grid
              container
              align="center"
              key={id}
              size={{
                xs: 12,
                sm: 6,
                md: 3,
              }}
            >
              <Grid
                size={{
                  xs: 12,
                  sm: 2,
                }}
              >
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  {name}
                </Typography>
              </Grid>
              <Grid
                size={{
                  xs: 12,
                  sm: 10,
                }}
              >
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Sell:{" "}
                  {formatNumberForLocale(
                    getMarketPriceForType(itemID, id, "sell"),
                  )}
                </Typography>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Buy:{" "}
                  {formatNumberForLocale(
                    getMarketPriceForType(itemID, id, "buy"),
                  )}
                </Typography>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
    </ContentPanel>
  );
}
