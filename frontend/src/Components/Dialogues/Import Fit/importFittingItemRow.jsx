import { Avatar, Checkbox, Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";

export function ImportFittingItemRow({ updateImportedItemList, item, index }) {
  if (!item.buildable) return null;
  return (
    <Grid container size={12}>
      <Grid
        container
        alignItems="center"
        justifyContent="center"
        size={{
          xs: 2,
          sm: 1
        }}>
        <Avatar
          src={`https://images.evetech.net/types/${item.itemID}/icon?size=32`}
          alt={item.itemName}
          variant="square"
          sx={{ height: 32, width: 32 }}
        />
      </Grid>
      <Grid
        container
        alignItems="center"
        size={{
          xs: 7,
          sm: 8
        }}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          {item.itemName}
        </Typography>
      </Grid>
      <Grid container justifyContent="center" alignItems="center" size={2}>
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          {formatNumberForLocale(item.itemCalculatedQty, { max: 0 })}
        </Typography>
      </Grid>
      <Grid size={1}>
        <Checkbox
          checked={item.included}
          onChange={() => {
            updateImportedItemList((prev) => {
              const newList = [...prev];
              newList[index].included = !newList[index].included;
              return newList;
            });
          }}
        />
      </Grid>
    </Grid>
  );
}
