import { CircularProgress, Paper, Typography, Grid } from "@mui/material";

import useUsersStore from "../../Zustand/usersStore";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";

export function SisiItem({ sisiItem, itemLoad, tranqItem }) {
  let totalItemCost = 0;

  function textColorCalc(sisiQuantity, tranqQuantity) {
    if (sisiQuantity === undefined || tranqQuantity === undefined) {
      return null;
    }
    if (sisiQuantity.quantity > tranqQuantity.quantity) {
      return "error.main";
    }
    if (sisiQuantity.quantity < tranqQuantity.quantity) {
      return "success.main";
    }
    return null;
  }

  function percentageDifferenceCalc(sisiQuantity, tranqQuantity) {
    if (
      sisiQuantity === undefined ||
      sisiQuantity === "missing" ||
      tranqQuantity === undefined ||
      tranqQuantity === "missing"
    ) {
      return null;
    }
    let returnValue =
      ((sisiQuantity.quantity - tranqQuantity.quantity) /
        sisiQuantity.quantity) *
      100;
    if (returnValue > 0) {
      return `+${formatNumberForLocale(returnValue, { max: 0 })}%`;
    }
    if (returnValue < 0) {
      return `${formatNumberForLocale(returnValue, { max: 0 })}%`;
    }
    return null;
  }

  return (
    <Paper square elevation={2} sx={{ padding: "20px" }}>
      <Grid container>
        {itemLoad && (
          <Grid align="center" size={12}>
            <CircularProgress color="primary" />
          </Grid>
        )}
        {sisiItem === "missing" && !itemLoad ? (
          <Grid size={12}>
            <Typography>Item Not Present</Typography>
          </Grid>
        ) : null}
        {sisiItem !== null && sisiItem !== "missing" && !itemLoad ? (
          <Grid size={12}>
            <Grid sx={{ marginBottom: "20px" }} size={12}>
              <Typography align="center" variant="h6" color="primary">
                Singularity
              </Typography>
            </Grid>
            {sisiItem.build.materials.map((material) => {
              let itemCost = useUsersStore
                .getState()
                .worldData.actions.findMarketData(material.typeID);

              let tranqData = undefined;
              if (tranqItem !== null && tranqItem !== "missing") {
                tranqData = tranqItem.build.materials.find(
                  (i) => i.typeID === material.typeID
                );
              }
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
                    <Grid
                      size={{
                        xs: 7,
                        sm: 8
                      }}
                      sx={{
                        alignItems: "center",
                        display: "flex"
                      }}>
                      <Typography
                        sx={{ typography: { xs: "caption", sm: "body2" } }}
                      >
                        {material.name}
                      </Typography>
                    </Grid>
                    <Grid
                      size={3}
                      sx={{
                        alignItems: "center",
                        justifyContent: "right",
                        display: "flex"
                      }}>
                      <Typography
                        sx={{
                          typography: { xs: "caption", sm: "body2" },
                          color: textColorCalc(material, tranqData),
                        }}
                      >
                        {formatNumberForLocale(material.quantity, { max: 0 })}
                      </Typography>
                    </Grid>
                    <Grid
                      size={{
                        xs: 2,
                        sm: 1
                      }}
                      sx={{
                        alignItems: "center",
                        justifyContent: "right",
                        display: "flex"
                      }}>
                      <Typography
                        sx={{
                          typography: { xs: "caption", sm: "body2" },
                          color: textColorCalc(material, tranqData),
                        }}
                      >
                        {percentageDifferenceCalc(material, tranqData)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Grid>
              );
            })}
            <Grid container sx={{ marginTop: "30px" }} size={12}>
              <Grid
                size={8}
                sx={{
                  alignItems: "center",
                  display: "flex"
                }}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  Items Produced Per Run:
                </Typography>
              </Grid>
              <Grid
                size={4}
                sx={{
                  alignItems: "center",
                  justifyContent: "right",
                  display: "flex"
                }}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  {sisiItem.rawData.products[0].quantity}
                </Typography>
              </Grid>
            </Grid>
            <Grid container sx={{ marginTop: "10px" }} size={12}>
              <Grid
                size={8}
                sx={{
                  alignItems: "center",
                  display: "flex"
                }}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  Total Material Cost (Jita Sell Orders):
                </Typography>
              </Grid>
              <Grid
                size={4}
                sx={{
                  alignItems: "center",
                  justifyContent: "right",
                  display: "flex"
                }}>
                <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
                  {formatNumberForLocale(totalItemCost, { max: 0 })}
                </Typography>
              </Grid>
            </Grid>
          </Grid>
        ) : null}
        {!itemLoad && sisiItem === null ? (
          <Grid size={12}>
            <Typography>Select Item To Begin</Typography>
          </Grid>
        ) : null}
      </Grid>
    </Paper>
  );
}
