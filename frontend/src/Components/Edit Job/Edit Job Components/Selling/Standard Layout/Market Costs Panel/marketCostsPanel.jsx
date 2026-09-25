import { Box, Typography, useMediaQuery, Grid } from "@mui/material";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/defaults/pricingSide";
import ItemMarketActions from "../../../../../../Styled Components/Item/marketActions";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import { STANDARD_TEXT_FORMAT } from "../../../../../../Context/defaultValues";
import { useMarketSources } from "../../../../../../Hooks/Static/useMarketSources";
import { readMarketPriceForType } from "../../../../../../Functions/MarketData/prices/marketPriceForType.js";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import { useMarketPricesQuery } from "../../../../../../Hooks/React Query/World/marketPrices";
import { useMemo } from "react";

export function MarketCostsPanel() {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
  const marketSources = useMarketSources();
  const itemID = useJobDraft((job) => job.itemID);

  // This panel is the one surface that compares every market at once, so it is
  // the one that has to ask for every market. Everything else resolves a single
  // market per figure and fetches only that, which leaves every other column
  // here reading a cache entry nothing filled.
  const wants = useMemo(
    () =>
      itemID == null
        ? []
        : marketSources.map(({ id }) => ({
            typeID: itemID,
            marketLocation: id,
          })),
    [itemID, marketSources],
  );
  useMarketPricesQuery(wants);

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
        <ItemMarketActions typeID={itemID} side={PRICING_SIDE.SELLING} />
      </Box>
      <Grid
        container
        sx={{
          width: "100%",
        }}
      >
        {marketSources.map(({ id, name }) => {
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
                    readMarketPriceForType(itemID, id, "sell"),
                  )}
                </Typography>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Buy:{" "}
                  {formatNumberForLocale(
                    readMarketPriceForType(itemID, id, "buy"),
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
