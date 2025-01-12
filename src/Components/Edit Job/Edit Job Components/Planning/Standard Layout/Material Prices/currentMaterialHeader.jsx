import { Grid, Tooltip, Typography } from "@mui/material";
import { useHelperFunction } from "../../../../../../Hooks/GeneralHooks/useHelperFunctions";
import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
  TWO_DECIMAL_PLACES,
} from "../../../../../../Context/defaultValues";

export function CurrentMaterialHeader({
  activeJob,
  marketSelect,
  listingSelect,
  setIsPriceHistoryDialogOpen,
  setPriceHistoryTypeID,
  setIsMarketDataDialogOpen,
  setMarketDataTypeID,
}) {
  const { findItemPriceObject } = useHelperFunction();

  const formatedMarketTitle =
    listingSelect.charAt(0).toUpperCase() + listingSelect.slice(1);

  const priceObject = findItemPriceObject(activeJob.itemID);

  const marketPriceObject = priceObject[marketSelect];

  const itemPrice = marketPriceObject[listingSelect] || 0;

  return (
    <Grid container item xs={12}>
      <Grid
        item
        md={1}
        sx={{
          display: { xs: "none", md: "block" },
          paddingRight: "5px",
        }}
        align="center"
      >
        <img
          src={`https://images.evetech.net/types/${activeJob.itemID}/icon?size=32`}
          alt=""
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <Tooltip title="Click to view price history." arrow placement="top">
          <Typography
            sx={{ typography: LARGE_TEXT_FORMAT, cursor: "pointer" }}
            onClick={() => {
              setPriceHistoryTypeID(activeJob.itemID);
              setIsPriceHistoryDialogOpen((prev) => !prev);
            }}
          >
            {activeJob.name}
          </Typography>
        </Tooltip>
      </Grid>
      <Grid
        item
        xs={6}
        md={3}
        align="center"
        sx={{ marginTop: { xs: "10px", md: "0px" } }}
      >
        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {`Item ${formatedMarketTitle} Price:`}
        </Typography>
        <Tooltip
          title="Click to view current market data."
          arrow
          placement="top"
        >
          <Typography
            sx={{ typography: STANDARD_TEXT_FORMAT }}
            onClick={() => {
              setMarketDataTypeID(activeJob.itemID);
              setIsMarketDataDialogOpen((prev) => !prev);
            }}
          >
            {itemPrice.toLocaleString(undefined, TWO_DECIMAL_PLACES)}
          </Typography>
        </Tooltip>
      </Grid>
      <Grid
        item
        xs={6}
        md={4}
        align="center"
        sx={{ marginTop: { xs: "10px", md: "0px" } }}
      >
        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {`Total ${formatedMarketTitle} Price:`}
        </Typography>

        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {(itemPrice * activeJob.build.products.totalQuantity).toLocaleString(
            undefined,
            TWO_DECIMAL_PLACES
          )}
        </Typography>
      </Grid>
      <Grid
        container
        item
        xs={12}
        sx={{
          marginTop: { xs: "30px", sm: "30px" },
          marginBottom: { xs: "10px" },
        }}
      >
        <Grid item md={5} sx={{ marginTop: { xs: "10px", sm: "20px" } }} />
        <Grid item xs={6} md={3} align="center">
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {`Material ${formatedMarketTitle}`} Price
            <br />
            <i>Build Price</i>
          </Typography>
        </Grid>
        <Grid item xs={6} md={4} align="center">
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Total Material Price <br />
            <i>Total Build Price</i>
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}
