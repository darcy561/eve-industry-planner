import { useMemo } from "react";
import { useWatchlistPricing } from "./useWatchlistPricing.js";
import { Typography, Grid } from "@mui/material";

import useUsersStore from "../../../../Zustand/usersStore";
import MaterialPopoverIconButtons from "../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";
import { calculateInstallCostfromSetup } from "../../../../Functions/Installation Costs/installCosts";

export function ExpandedWatchlistRow({ mat }) {
  const { buying, sellingMarket } = useWatchlistPricing();
  const { findMarketData } = useUsersStore.getState().worldData.actions;
  const marketData = useUsersStore((state) => state.worldData.marketData);

  const matWorth = findMarketData(mat.typeID)?.[sellingMarket]?.sell ?? 0;
  const matBuildPrice = useMemo(() => {
    let buildPrice = calculateInstallCostfromSetup(mat?.buildData);
    mat.materials.forEach((x) => {
      let matBuildCalc = 0;
      let xPrice = findMarketData(x.typeID);
      matBuildCalc +=
        ((xPrice?.[buying.marketDisplay]?.[buying.orderDisplay] ?? 0) *
          x.quantity) /
        mat.quantityProduced;
      buildPrice += matBuildCalc * mat.quantity;
    });
    return buildPrice / mat.quantity;
  }, [marketData, buying.marketDisplay, buying.orderDisplay]);

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
        <MaterialPopoverIconButtons typeID={mat.typeID}>
          <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
            {mat.name}
          </Typography>
        </MaterialPopoverIconButtons>
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
