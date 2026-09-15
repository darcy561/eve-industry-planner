import {
  Avatar,
  Box,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo } from "react";
import { MdOutlineLinkOff } from "react-icons/md";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import useLocationNames from "../../../../../../Hooks/EveEsi/useLocationNames";
import { UNNAMED_LOCATION_LABEL } from "../../../../../../Functions/Assets/assetLocationConstants";
import {
  characterImageUrl,
  corporationImageUrl,
} from "../../../../../../Functions/Shared/eveImage";

export function LinkedMarketOrdersTab({
  state,
  actions,
  activeOrder,
  updateActiveOrder,
}) {
  const getCorporation =
    useUsersStore.getState().account.actions.getCorporation;
  const jobLockReadOnly = useActiveJobReadOnly(state);
  const marketOrders = state.activeJob.build.sale.marketOrders;
  const locationIds = useMemo(
    () => (marketOrders ?? []).map((order) => order.location_id),
    [marketOrders],
  );
  const { names: locationNames } = useLocationNames(locationIds);

  return (
    <Grid container>
      <Grid
        container
        sx={{
          overflowY: "auto",
          maxHeight: {
            xs: 350,
            sm: 260,
            md: 240,
            lg: 240,
            xl: 480,
          },
        }}
        size={12}
      >
        {marketOrders?.map((order) => {
          const charData = useUsersStore
            .getState()
            .account.actions.findCharacterByHash(order.CharacterHash);
          const locationName =
            locationNames[order.location_id]?.name || UNNAMED_LOCATION_LABEL;

          const corpData = getCorporation(charData?.corporation_id);

          return (
            <Grid
              key={order.order_id}
              container
              sx={{ marginBottom: { xs: 2, sm: 0 } }}
              size={{
                xs: 12,
                sm: 6,
              }}
            >
              <Grid container>
                <Grid
                  container
                  align="center"
                  size={12}
                  sx={{
                    justifyContent: "center",
                  }}
                >
                  <Tooltip
                    title={
                      order.is_corporation
                        ? (corpData?.name ?? "Corporation Data Unavailable")
                        : (charData?.CharacterName ??
                          "Character Data Unavailable")
                    }
                    arrow
                    placement="right"
                  >
                    <Avatar
                      src={
                        order.is_corporation
                          ? corporationImageUrl(corpData?.corporation_id, 64)
                          : characterImageUrl(charData?.CharacterID, 64)
                      }
                      variant="circular"
                      sx={{
                        height: 32,
                        width: 32,
                      }}
                    />
                  </Tooltip>
                  <Grid size={12}>
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {formatNumberForLocale(order.volume_remain, { max: 0 })}/
                      {formatNumberForLocale(order.volume_total, { max: 0 })}{" "}
                      Items Remaining
                    </Typography>
                  </Grid>
                  <Grid size={12}>
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {formatNumberForLocale(order.item_price)} ISK Per Item
                    </Typography>
                  </Grid>
                  <Grid size={12}>
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      {locationName}
                    </Typography>
                  </Grid>
                  <Grid size={12}>
                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                      Duration: {order.duration} Days
                    </Typography>
                  </Grid>
                  <Grid
                    sx={{ margin: { xs: 0.5, sm: 0 }, marginTop: 1 }}
                    size={12}
                  >
                    <>
                      {charData === undefined && (
                        <Box
                          sx={{
                            backgroundColor: "error.main",
                            color: "black",
                            marginLeft: "auto",
                            marginRight: "auto",
                            padding: 0.5,
                          }}
                        >
                          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                            Unable To Update Order Information
                          </Typography>
                        </Box>
                      )}
                      {order.state === "cancelled" && (
                        <Box
                          sx={{
                            backgroundColor: "warning.main",
                            color: "black",
                            marginLeft: "auto",
                            marginRight: "auto",
                            padding: 0.5,
                            "& .MuiFormHelperText-root": {
                              color: (theme) => theme.palette.secondary.main,
                            },
                            "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                              {
                                display: "none",
                              },
                          }}
                        >
                          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                            Order Canceled
                          </Typography>
                        </Box>
                      )}
                      {order.volume_remain === 0 &&
                        order.state === "expired" && (
                          <Box
                            sx={{
                              color: "black",
                              backgroundColor: "success.main",
                              marginLeft: "auto",
                              marginRight: "auto",
                              padding: 0.5,
                              "& .MuiFormHelperText-root": {
                                color: (theme) => theme.palette.secondary.main,
                              },
                              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                                {
                                  display: "none",
                                },
                            }}
                          >
                            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                              Complete
                            </Typography>
                          </Box>
                        )}
                      {order.state === "active" && (
                        <Box
                          sx={{
                            color: "black",
                            backgroundColor: "primary.main",
                            marginLeft: "auto",
                            marginRight: "auto",
                            padding: 0.5,
                            "& .MuiFormHelperText-root": {
                              color: (theme) => theme.palette.secondary.main,
                            },
                            "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                              {
                                display: "none",
                              },
                          }}
                        >
                          <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                            Active
                          </Typography>
                        </Box>
                      )}
                    </>
                  </Grid>
                </Grid>
                <Grid align="center" size={12}>
                  {state.activeJob.build.sale.marketOrders.length > 1 && (
                    <Tooltip
                      title="Filter Transactions By Location"
                      arrow
                      placement="bottom"
                    >
                      <IconButton
                        color="primary"
                        sx={{ marginRight: 2 }}
                        onClick={() => {
                          let newActiveOrder = [...activeOrder];
                          if (
                            activeOrder.some((t) => t === order.location_id)
                          ) {
                            newActiveOrder = newActiveOrder.filter(
                              (i) => i != order.location_id,
                            );
                          } else {
                            newActiveOrder.push(order.location_id);
                          }
                          updateActiveOrder(newActiveOrder);
                        }}
                      >
                        {activeOrder.some((t) => t === order.location_id) ? (
                          <FilterAltOffIcon />
                        ) : (
                          <FilterAltIcon />
                        )}
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip
                    title={
                      jobLockReadOnly
                        ? lockReasonText({
                            action: "unlinking market orders is disabled",
                          })
                        : "Unlink Order From Job."
                    }
                    arrow
                    placemnet="bottom"
                  >
                    <span>
                      <IconButton
                        color="error"
                        size="small"
                        disabled={jobLockReadOnly}
                        onClick={() => {
                          if (jobLockReadOnly) return;
                          state.activeJob.removeMarketOrder(order);
                          actions.addMarketOrdersForRemoval(
                            order.order_id,
                            state.activeJob.build.sale.transactions.filter(
                              (item) => item.location_id === order.location_id,
                            ),
                          );
                          actions.updateActiveJob(state.activeJob);
                          showSnackbarError("Unlinked");
                        }}
                      >
                        <MdOutlineLinkOff />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Grid>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
    </Grid>
  );
}
