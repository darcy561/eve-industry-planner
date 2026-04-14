import { Typography, Grid } from "@mui/material";

import { WatchListRow } from "./ItemRow";
import { WatchlistGroup } from "./watchlistGroup";
import useUsersStore from "../../../../Zustand/usersStore";

export function WatchlistContainer({
  updateGroupSettingsTrigger,
  groupSettingsContent,
  updateGroupSettingsContent,
  setOpenDialog,
  updateWatchlistItemToEdit,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrderType
  );

  if (userWatchlist.items.length === 0) {
    return (
      <Grid align="center" size={12}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          You have no items on your watchlist.
        </Typography>
      </Grid>
    );
  }

  if (userWatchlist.items.length > 0) {
    return (
      <>
        <Grid
          container
          sx={{
            marginBottom: "20px",
            display: { xs: "none", sm: "flex" },
          }}
          size={12}>
          <Grid
            size={{
              sm: 4,
              lg: 3
            }} />
          <Grid
            size={{
              sm: 2,
              lg: 2
            }}>
            <Typography
              align="center"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              Item Sell Price
            </Typography>
          </Grid>
          <Grid
            size={{
              sm: 3,
              lg: 3
            }}>
            <Typography
              align="center"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              Total Est Build Cost Per Item
            </Typography>
            <Typography
              align="center"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              ({defaultOrders.charAt(0).toUpperCase() + defaultOrders.slice(1)}{" "}
              Orders)
            </Typography>
          </Grid>
          <Grid
            size={{
              sm: 3,
              lg: 3
            }}>
            <Typography
              align="center"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              Total Est Build Cost With Child Jobs Per Item
            </Typography>
            <Typography
              align="center"
              sx={{ typography: { xs: "caption", sm: "body2" } }}
            >
              ({defaultOrders.charAt(0).toUpperCase() + defaultOrders.slice(1)}{" "}
              Orders)
            </Typography>
          </Grid>
        </Grid>
        {userWatchlist.groups.map((group, index) => {
          return (
            <WatchlistGroup
              key={group.id}
              group={group}
              index={index}
              updateGroupSettingsTrigger={updateGroupSettingsTrigger}
              updateGroupSettingsContent={updateGroupSettingsContent}
              groupSettingsContent={groupSettingsContent}
              setOpenDialog={setOpenDialog}
              updateWatchlistItemToEdit={updateWatchlistItemToEdit}
            />
          );
        })}
        {userWatchlist.items.map((item, index) => {
          if (item.group === undefined || item.group === 0) {
            return (
              <WatchListRow
                key={item.id}
                item={item}
                index={index}
                setOpenDialog={setOpenDialog}
                updateWatchlistItemToEdit={updateWatchlistItemToEdit}
              />
            );
          }
          return null;
        })}
      </>
    );
  }
}
