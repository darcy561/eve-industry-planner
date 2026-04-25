import {
  Typography,
  Grid,
} from "@mui/material";

import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import { getMarketPriceForType } from "./marketPriceHelpers";
import { getListingModeLabel } from "./Helpers/marketLabelHelpers";

export function CurrentMaterialHeader({
  state,
  marketSelect,
  listingSelect,
}) {
  const listingModeLabel = getListingModeLabel(listingSelect);

  const itemPrice = getMarketPriceForType(
    state.activeJob.itemID,
    marketSelect,
    listingSelect
  );

  return (
    <Grid container size={12} sx={{ marginBottom: { xs: 2, md: 4 } }}>
      <Grid
        container
        sx={{ marginBottom: { xs: 1, md: 2 } }}
        size={12}
      >
        <Grid size={{ md: 5 }} />
        <Grid align="center" size={{ xs: 6, md: 3 }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Unit Price
          </Typography>
        </Grid>
        <Grid align="center" size={{ xs: 6, md: 4 }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Total Price
          </Typography>
        </Grid>
      </Grid>
      <Grid container size={12}>
        <Grid
          sx={{
            display: { xs: "none", md: "flex" },
            paddingRight: "5px",
            justifyContent: "center",
            alignItems: "center",
          }}
          align="center"
          size={{
            md: 1
          }}>
          <img
            src={`https://images.evetech.net/types/${state.activeJob.itemID}/icon?size=32`}
            alt=""
          />
        </Grid>
        <Grid
          size={{
            xs: 12,
            md: 4
          }}
          sx={{
            alignItems: "center",
            display: "flex",
          }}
          >
          <MaterialPopoverIconButtons
            typeID={state.activeJob.itemID}
            regionID={marketSelect}
          >
            <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
              {state.activeJob.name}
            </Typography>
          </MaterialPopoverIconButtons>
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 6,
            md: 3
          }}>
          <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
            {`Market ${listingModeLabel} price`}
          </Typography>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(itemPrice)}
          </Typography>
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 6,
            md: 4
          }}>
          <Typography sx={{ typography: { xs: "caption", sm: "caption" } }}>
            {`Market ${listingModeLabel} total`}
          </Typography>

          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {formatNumberForLocale(
              itemPrice * state.activeJob.build.products.totalQuantity
            )}
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}
