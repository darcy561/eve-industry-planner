import { CircularProgress, Paper, Typography, Grid } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";

export function TranqItem({ tranqItem, itemLoad }) {
  let totalItemCost = 0;

  return (
    <Paper square elevation={2} sx={{ padding: "20px" }}>
      <Grid container>
        {itemLoad && (
          <Grid align="center" size={12}>
            <CircularProgress color="primary" />
          </Grid>
        )}
        {tranqItem === "missing" && !itemLoad ? (
          <Grid size={12}>
            <Typography>Item Not Present</Typography>
          </Grid>
        ) : null}
        {tranqItem !== null && tranqItem !== "missing" && !itemLoad ? (
          <Grid container size={12}>
            <Grid sx={{ marginBottom: "20px" }} size={12}>
              <Typography align="center" variant="h6" color="primary">
                Tranquility
              </Typography>
            </Grid>
            {tranqItem.build.materials.map((material) => {
              let itemCost = useUsersStore
                .getState()
                .worldData.actions.findMarketData(material.typeID);
              if (itemCost !== undefined) {
                totalItemCost += itemCost.jita.sell * material.quantity;
              }
              return (
                <Grid key={material.typeID} container size={12}>
                  <Grid
                    size={{
                      xs: 2,
                      sm: 1
                    }}>
                    <img
                      src={`https://images.evetech.net/types/${material.typeID}/icon?size=32`}
                      alt=""
                    />
                  </Grid>
                  <Grid
                    container
                    size={{
                      xs: 10,
                      sm: 11
                    }}>
                    <Grid alignItems="center" sx={{ display: "flex" }} size={8}>
                      <Typography
                        sx={{ typography: { xs: "caption", sm: "body2" } }}
                      >
                        {material.name}
                      </Typography>
                    </Grid>
                    <Grid
                      alignItems="center"
                      justifyContent="right"
                      sx={{ display: "flex" }}
                      size={4}>
                      <Typography
                        sx={{ typography: { xs: "caption", sm: "body2" } }}
                      >
                        {formatNumberForLocale(material.quantity, { max: 0 })}
                      </Typography>
                    </Grid>
                  </Grid>
                </Grid>
              );
            })}
            <Grid container sx={{ marginTop: "30px" }} size={12}>
              <Grid alignItems="center" sx={{ display: "flex" }} size={8}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  Items Produced Per Run:
                </Typography>
              </Grid>
              <Grid
                alignItems="center"
                justifyContent="right"
                sx={{ display: "flex" }}
                size={4}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  {formatNumberForLocale(
                    tranqItem.rawData.products[0].quantity,
                    { max: 0 }
                  )}
                </Typography>
              </Grid>
            </Grid>
            <Grid container sx={{ marginTop: "10px" }} size={12}>
              <Grid alignItems="center" sx={{ display: "flex" }} size={8}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  Total Material Cost (Jita Sell Orders):
                </Typography>
              </Grid>
              <Grid
                alignItems="center"
                justifyContent="right"
                sx={{ display: "flex" }}
                size={4}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  {formatNumberForLocale(totalItemCost, { max: 0 })}
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        ) : null}
        {!itemLoad && tranqItem === null ? (
          <Grid size={12}>
            <Typography>Select Item To Begin</Typography>
          </Grid>
        ) : null}
      </Grid>
    </Paper>
  );
}
