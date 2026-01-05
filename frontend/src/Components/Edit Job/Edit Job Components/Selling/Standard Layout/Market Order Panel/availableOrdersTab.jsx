import { Avatar, IconButton, Tooltip, Typography, Grid } from "@mui/material";

import AddLinkIcon from "@mui/icons-material/AddLink";
import { getAnalytics, logEvent } from "firebase/analytics";
import { useJobManagement } from "../../../../../../Hooks/useJobManagement";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useQueryClient } from "@tanstack/react-query";
import findBrokersFeeEntry from "../../../../../../Functions/MarketOrders/findBrokersFeeEntry";
import {
  formatDateForLocale,
  formatNumberForLocale,
} from "../../../../../../Functions/Helper/numberParser";

export function AvailableMarketOrdersTab({
  state,
  actions,
  itemOrderMatch
}) {
  const queryClient = useQueryClient();
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const getCorporationObject =
    useUsersStore.getState().users.actions.getCorporationObject;
  const { calcBrokersFee } = useJobManagement();
  const analytics = getAnalytics();

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
      >
        {itemOrderMatch.length !== 0 ? (
          itemOrderMatch.map((order) => {
            const charData = useUsersStore
              .getState()
              .users.actions.findUserByCharacterHash(order.CharacterHash);
            const locationName =
              useUsersStore
                .getState()
                .worldData.actions.findUniverseData(order.location_id)?.name ??
              "Location Data Unavailable";

            let corpData = null;
            if (order.is_corporation) {
              corpData = getCorporationObject(order.corporation_id);
            }

            return (
              <Grid
                key={order.order_id}
                container
                sx={{ marginBottom: { xs: 2, sm: 0 } }}
                size={{
                  xs: 12,
                  sm: 6
                }}>
                <Grid container>
                  <Grid container align="center" justifyContent="center" size={12}>
                    <Tooltip
                      title={
                        order.is_corporation
                          ? corpData?.corporationName ??
                          "Corporation Data Unavailable"
                          : charData?.CharacterName ??
                          "Character Data Unavailable"
                      }
                      arrow
                      placement="right"
                    >
                      <Avatar
                        src={
                          order.is_corporation
                            ? corpData
                              ? `https://images.evetech.net/corporations/${corpData.corporation_id}/logo`
                              : ""
                            : charData
                              ? `https://images.evetech.net/characters/${charData.CharacterID}/portrait`
                              : ""
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
                        {formatNumberForLocale(order.price)} ISK Per Item
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
                    <Grid sx={{ marginTop: 0.5 }} size={12}>
                      <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                        Last Modified:
                      </Typography>
                      <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                        {formatDateForLocale(order.issued)}
                      </Typography>
                    </Grid>
                  </Grid>
                  <Grid align="center" size={12}>
                    <Tooltip
                      title="Link Order To Job."
                      arrow
                      placement="bottom"
                    >
                      <IconButton
                        color="primary"
                        size="small"
                        onClick={async () => {
                          try {
                            const brokersFee = await calcBrokersFee(order);
                            const brokersFeeObject = findBrokersFeeEntry(
                              order,
                              brokersFee,
                              queryClient
                            );
                            state.activeJob.addMarketOrder(
                              order,
                              brokersFeeObject
                            );
                            actions.addMarketOrdersForAddition(order.order_id);
                            actions.updateActiveJob(state.activeJob);
                            showSnackbarSuccess("Linked");
                            logEvent(analytics, "linkedMarketOrder", {
                              UID: useUsersStore
                                .getState()
                                .users.actions.findParentUser().accountID,
                              isLoggedIn: isLoggedIn,
                            });
                          } catch (error) {
                            console.error(
                              "Failed to link market order:",
                              error
                            );
                            showSnackbarError("Failed to link market order");
                          }
                        }}
                      >
                        <AddLinkIcon />
                      </IconButton>
                    </Tooltip>
                  </Grid>
                </Grid>
              </Grid>
            );
          })
        ) : (
          <Grid align="center" size={12}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              There are no orders appearing on the API matching this item type.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Grid>
  );
}
