import { Typography, Grid, Box, CircularProgress } from "@mui/material";
import { useWatchlistPricing } from "./useWatchlistPricing.js";
import { useMemo } from "react";

import { WatchListRow } from "./ItemRow";
import { WatchlistGroup } from "./watchlistGroup";
import useUsersStore from "../../../../Zustand/usersStore";
import { pricesWantedByWatchlist } from "../../../../Functions/MarketData/pricesWanted";
import { useMarketPricesQuery } from "../../../../Hooks/React Query/World/marketPrices";

function WatchlistContainerInner({ onOpenGroupSettings, onEditWatchlistItem }) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  // Both columns state a build cost, which is what the materials cost to buy.
  const { listingType } = useWatchlistPricing();

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
          size={12}
        >
          <Grid
            size={{
              sm: 4,
              lg: 3,
            }}
          />
          <Grid
            size={{
              sm: 2,
              lg: 2,
            }}
          >
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
              lg: 3,
            }}
          >
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
              ({listingType.charAt(0).toUpperCase() + listingType.slice(1)}{" "}
              Orders)
            </Typography>
          </Grid>
          <Grid
            size={{
              sm: 3,
              lg: 3,
            }}
          >
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
              ({listingType.charAt(0).toUpperCase() + listingType.slice(1)}{" "}
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
            onOpenGroupSettings={onOpenGroupSettings}
            onEditWatchlistItem={onEditWatchlistItem}
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
              onEditWatchlistItem={onEditWatchlistItem}
            />
          );
        }
        return null;
      })}
    </>
  );
}

/**
 * Holds the watchlist behind its prices: the rows read them synchronously, so
 * they wait for the first fetch and are drawn without prices if it fails.
 */
export function WatchlistContainer(props) {
  const items = useUsersStore((state) => state.jobData.userWatchlist.items);
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );

  const { wants } = useMemo(
    () => pricesWantedByWatchlist(items, accountPricing),
    [items, accountPricing],
  );
  const { isLoading } = useMarketPricesQuery(wants);

  if (items.length > 0 && isLoading) {
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
