import { Typography, Grid } from "@mui/material";

import {
  LARGE_TEXT_FORMAT,
  STANDARD_TEXT_FORMAT,
} from "../../../../../../Context/defaultValues";
import MaterialPopoverIconButtons from "../../../../../../Styled Components/Popover/iconButtons";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

export function CurrentMaterialHeader({ state, marketSelect, listingSelect }) {
  const formatedMarketTitle =
    listingSelect.charAt(0).toUpperCase() + listingSelect.slice(1);

  const priceObject = useUsersStore
    .getState()
    .worldData.actions.findMarketData(state.activeJob.itemID);

  const marketPriceObject = priceObject[marketSelect];

  const itemPrice = marketPriceObject[listingSelect] || 0;

  return (
    <Grid container size={12}>
      <Grid
        sx={{
          display: { xs: "none", md: "block" },
          paddingRight: "5px",
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
        }}>
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
        sx={{ marginTop: { xs: "10px", md: "0px" } }}
        size={{
          xs: 6,
          md: 3
        }}>
        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {`Item ${formatedMarketTitle} Price:`}
        </Typography>
        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {formatNumberForLocale(itemPrice)}
        </Typography>
      </Grid>
      <Grid
        align="center"
        sx={{ marginTop: { xs: "10px", md: "0px" } }}
        size={{
          xs: 6,
          md: 4
        }}>
        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {`Total ${formatedMarketTitle} Price:`}
        </Typography>

        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
          {formatNumberForLocale(
            itemPrice * state.activeJob.build.products.totalQuantity
          )}
        </Typography>
      </Grid>
      <Grid
        container
        sx={{
          marginTop: { xs: "30px", sm: "30px" },
          marginBottom: { xs: "10px" },
        }}
        size={12}>
        <Grid
          sx={{ marginTop: { xs: "10px", sm: "20px" } }}
          size={{
            md: 5
          }} />
        <Grid
          align="center"
          size={{
            xs: 6,
            md: 3
          }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {`Material ${formatedMarketTitle}`} Price
            <br />
            <i>Build Price</i>
          </Typography>
        </Grid>
        <Grid
          align="center"
          size={{
            xs: 6,
            md: 4
          }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Total Material Price <br />
            <i>Total Build Price</i>
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
}
