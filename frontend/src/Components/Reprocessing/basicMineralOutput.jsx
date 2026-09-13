import { useMemo } from "react";
import {
  Avatar,
  Box,
  Grid,
  Typography,
  Divider,
  Fade,
  CircularProgress,
  useMediaQuery,
} from "@mui/material";
import { useItemList } from "../../Hooks/Static/useItems";
import { itemNameFrom } from "../../Functions/Static/items";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import ItemMarketActions from "../../Styled Components/Item/marketActions";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";

function BasicMineralOutput({ pageState }) {
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("md"));
  const findMarketData =
    useUsersStore.getState().worldData.actions.findMarketData;
  const { records: itemRecords, isLoading } = useItemList();

  const totalReprocessingValue = useMemo(() => {
    if (isLoading) return 0;
    return pageState.processedInput.reduce((acc, item) => {
      if (item.quantity === 0) return acc;
      const itemPriceObject = findMarketData(item.id);
      const unitPrice =
        itemPriceObject[pageState.marketLocation][pageState.marketListing] ?? 0;
      return acc + unitPrice * item.quantity;
    }, 0);
  }, [
    pageState.processedInput,
    pageState.marketLocation,
    pageState.marketListing,
    isLoading,
  ]);

  const totalUnreprocessedValue = useMemo(() => {
    if (isLoading) return 0;
    return pageState.reprocessingObjects.reduce((acc, item) => {
      if (item.batchSize > item.totalQuantity) return acc;
      const itemPriceObject = findMarketData(item.id);
      const unitPrice =
        itemPriceObject[pageState.marketLocation][pageState.marketListing] ?? 0;
      return acc + unitPrice * item.totalQuantity;
    }, 0);
  }, [
    pageState.reprocessingObjects,
    pageState.marketLocation,
    pageState.marketListing,
    isLoading,
  ]);

  if (isLoading) {
    return <CircularProgress />;
  }

  return (
    <Box>
      <Grid
        container
        spacing={2}
        sx={{
          alignItems: "center",
          marginTop: 2,
          marginBottom: 4,
        }}
      >
        <Grid
          size={{
            xs: 6,
            md: 6,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              Total Unreprocessed Value:
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center", mt: 1 }}>
            <Fade in key={`${totalUnreprocessedValue}`} timeout={500}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                {formatNumberForLocale(totalUnreprocessedValue)}
              </Typography>
            </Fade>
          </Box>
        </Grid>

        <Grid
          size={{
            xs: 6,
            md: 6,
          }}
        >
          <Box sx={{ textAlign: "center" }}>
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              Total Reprocessed Value:
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center", mt: 1 }}>
            <Fade in key={`${totalReprocessingValue}`} timeout={500}>
              <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                {formatNumberForLocale(totalReprocessingValue)}
              </Typography>
            </Fade>
          </Box>
        </Grid>
      </Grid>
      <Divider sx={{ marginTop: 2, marginBottom: 2 }} />
      <Grid
        container
        spacing={isMobile ? 0.5 : 2}
        sx={{
          alignItems: "center",
          marginBottom: 2,
        }}
      >
        <Grid
          sx={{ display: { xs: "none", md: "block" } }}
          size={{
            xs: 0,
            md: 1,
          }}
        />
        <Grid
          size={{
            xs: 3,
            md: 3,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
            Item Name
          </Typography>
        </Grid>
        <Grid sx={{ textAlign: "center" }} size={2}>
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
            Quantity
          </Typography>
        </Grid>
        <Grid
          sx={{ textAlign: "center" }}
          size={{
            xs: 3,
            md: 2,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
            Unit Price
          </Typography>
        </Grid>
        <Grid
          sx={{ textAlign: "center" }}
          size={{
            xs: 4,
            md: 2,
          }}
        >
          <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="center">
            Total Value
          </Typography>
        </Grid>
        <Grid
          sx={{ textAlign: "center", display: { xs: "none", md: "block" } }}
          size={{
            xs: 0,
            md: 2,
          }}
        >
          <Typography
            sx={{ typography: LARGE_TEXT_FORMAT }}
            align="center"
          ></Typography>
        </Grid>
      </Grid>
      <Divider sx={{ marginTop: 2, marginBottom: 2 }} />
      <Grid container spacing={2}>
        {pageState.processedInput.map((item) => {
          if (item.quantity === 0) return null;
          const matchedName = itemNameFrom(item.id, itemRecords);
          const itemPriceObject = findMarketData(item.id);
          const unitPrice =
            itemPriceObject[pageState.marketLocation][
              pageState.marketListing
            ] ?? 0;
          const totalValue = unitPrice * item.quantity;

          return (
            <Grid
              container
              key={item.id}
              spacing={isMobile ? 0.5 : 2}
              size={12}
              sx={{
                alignItems: "center",
              }}
            >
              <Grid
                sx={{
                  textAlign: "center",
                  display: { xs: "none", md: "block" },
                }}
                size={1}
              >
                <Avatar
                  src={`https://images.evetech.net/types/${item.id}/icon?size=32`}
                  alt={matchedName}
                  variant="square"
                  sx={{ height: 32, width: 32 }}
                />
              </Grid>
              <Grid
                align="center"
                size={{
                  xs: 3,
                  md: 3,
                }}
              >
                <ItemMarketActions
                  typeID={item.id}
                  regionID={pageState.marketLocation}
                >
                  <Typography
                    sx={{
                      typography: STANDARD_TEXT_FORMAT,
                      wordWrap: "break-word",
                      overflowWrap: "break-word",
                      hyphens: "auto",
                    }}
                    align="center"
                  >
                    {matchedName}
                  </Typography>
                </ItemMarketActions>
              </Grid>
              <Grid sx={{ textAlign: "center" }} size={2}>
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  {formatNumberForLocale(item.quantity, { max: 0 })}
                </Typography>
              </Grid>
              <Grid
                sx={{ textAlign: "center" }}
                size={{
                  xs: 3,
                  md: 2,
                }}
              >
                <Fade in key={`${unitPrice}`} timeout={500}>
                  <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                    {formatNumberForLocale(unitPrice)}
                  </Typography>
                </Fade>
              </Grid>
              <Grid
                sx={{ textAlign: "center" }}
                size={{
                  xs: 4,
                  md: 2,
                }}
              >
                <Fade in key={`${totalValue}`} timeout={500}>
                  <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                    {formatNumberForLocale(totalValue)}
                  </Typography>
                </Fade>
              </Grid>
            </Grid>
          );
        })}
      </Grid>
      <Divider sx={{ marginY: 2 }} />
    </Box>
  );
}

export default BasicMineralOutput;
