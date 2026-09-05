import { Typography, Grid, Box, CircularProgress } from "@mui/material";
import { useEffect, useState } from "react";

import { WatchListRow } from "./ItemRow";
import { WatchlistGroup } from "./watchlistGroup";
import useUsersStore from "../../../../Zustand/usersStore";
import getMarketData from "../../../../Functions/MarketData/findMarketData";
import { collectWatchlistTypeIds } from "../../../../Functions/MarketData/collectWatchlistTypeIds";

function WatchlistContainerInner({
  updateGroupSettingsTrigger,
  groupSettingsContent,
  updateGroupSettingsContent,
  setOpenDialogue,
  updateWatchlistItemToEdit,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrderType
  );

  const hasItems = userWatchlist.items.length > 0;
  const hasGroups = userWatchlist.groups?.length > 0;

  if (!hasItems && !hasGroups) {
    return (
      <Grid align="center" size={12}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          You have no items on your watchlist.
        </Typography>
      </Grid>
    );
  }

  return (
    <>
      {hasItems && (
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
      )}
      {userWatchlist.groups.map((group, index) => {
        return (
          <WatchlistGroup
            key={group.id}
            group={group}
            index={index}
            updateGroupSettingsTrigger={updateGroupSettingsTrigger}
            updateGroupSettingsContent={updateGroupSettingsContent}
            groupSettingsContent={groupSettingsContent}
            setOpenDialogue={setOpenDialogue}
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
              setOpenDialogue={setOpenDialogue}
              updateWatchlistItemToEdit={updateWatchlistItemToEdit}
            />
          );
        }
        return null;
      })}
    </>
  );
}

/**
 * Fetches market prices for watchlist type IDs after watchlist data is present (per login bootstrap),
 * then renders rows that depend on `worldData.marketData`.
 */
export function WatchlistContainer(props) {
  const items = useUsersStore((state) => state.jobData.userWatchlist.items);
  const addMarketData = useUsersStore(
    (state) => state.worldData.actions.addMarketData
  );
  const [marketReady, setMarketReady] = useState(false);

  useEffect(() => {
    if (!items || items.length === 0) {
      setMarketReady(true);
      return;
    }
    let cancelled = false;
    setMarketReady(false);
    (async () => {
      try {
        const idSet = collectWatchlistTypeIds(items);
        const itemPriceResult = await getMarketData(idSet);
        if (cancelled) return;
        addMarketData(itemPriceResult);
      } catch (e) {
        console.error("watchlist market prefetch", e);
      } finally {
        if (!cancelled) {
          setMarketReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, addMarketData]);

  if (items.length > 0 && !marketReady) {
    return (
      <Grid align="center" size={12} sx={{ py: 2 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 1,
          }}
        >
          <CircularProgress size={24} />
          <Typography variant="body2" color="text.secondary">
            Loading market data…
          </Typography>
        </Box>
      </Grid>
    );
  }

  return <WatchlistContainerInner {...props} />;
}
