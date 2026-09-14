import { useMemo } from "react";
import { useWatchlistPricing } from "./useWatchlistPricing.js";
import { Typography, Grid } from "@mui/material";

import ItemMarketActions from "../../../../Styled Components/Item/marketActions";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";
import { calculateInstallCostfromSetup } from "../../../../Functions/Installation Costs/installCosts";

export function ExpandedWatchlistRow({ mat }) {
  const { buyingPrice, sellWorth } = useWatchlistPricing();

  const matWorth = sellWorth(mat.typeID);
  const matBuildPrice = useMemo(() => {
    let buildPrice = calculateInstallCostfromSetup(mat?.buildData);
    mat.materials.forEach((x) => {
      let matBuildCalc = 0;
      matBuildCalc +=
        (buyingPrice(x.typeID) * x.quantity) / mat.quantityProduced;
      buildPrice += matBuildCalc * mat.quantity;
    });
    return buildPrice / mat.quantity;
  }, [buyingPrice]);

  return (
    <Grid
      container
      size={{
        xs: 6,
        lg: 2,
      }}
    >
      <Grid align="center" size={12}>
        <img
          src={`https://images.evetech.net/types/${mat.typeID}/icon?size=32`}
          alt=""
        />
      </Grid>
      <Grid align="center" size={12}>
        <ItemMarketActions typeID={mat.typeID}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            {mat.name}
          </Typography>
        </ItemMarketActions>
      </Grid>
      <Grid
        size={{
          xs: 12,
          lg: 4,
        }}
      >
        <Typography
          align="center"
          sx={{
            typography: { xs: "caption", sm: "body2" },
          }}
        >
          Sell Price
        </Typography>
      </Grid>
      <Grid
        sx={{
          color:
            mat.materials.length > 0
              ? matBuildPrice < matWorth
                ? "error.main"
                : "success.main"
              : "none",
        }}
        size={{
          xs: 12,
          lg: 8,
        }}
      >
        <Typography
          sx={{ typography: { xs: "caption", sm: "body2" } }}
          align="center"
        >
          {formatNumberForLocale(matWorth)}
        </Typography>
      </Grid>
      <Grid container size={12}>
        {mat.materials.length > 0 && (
          <>
            <Grid
              size={{
                xs: 12,
                lg: 4,
              }}
            >
              <Typography
                align="center"
                sx={{
                  typography: { xs: "caption", sm: "body2" },
                }}
              >
                Build Price
              </Typography>
            </Grid>
            <Grid
              sx={{
                color: matBuildPrice > matWorth ? "error.main" : "success.main",
              }}
              size={{
                xs: 12,
                lg: 8,
              }}
            >
              <Typography
                align="center"
                sx={{
                  typography: { xs: "caption", sm: "body2" },
                }}
              >
                {formatNumberForLocale(matBuildPrice)}
              </Typography>
            </Grid>
          </>
        )}
      </Grid>
    </Grid>
  );
}
