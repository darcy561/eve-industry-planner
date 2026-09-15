import { Checkbox, Typography, Grid } from "@mui/material";

import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import EveImageAvatar from "../../../Styled Components/Avatar/EveImageAvatar";

export function ImportFittingItemRow({ updateImportedItemList, item, index }) {
  if (!item.buildable) return null;
  return (
    <Grid container size={12}>
      <Grid
        container
        size={{
          xs: 2,
          sm: 1,
        }}
        sx={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <EveImageAvatar
          type={item.itemID}
          alt={item.itemName}
          size={32}
          variant="square"
        />
      </Grid>
      <Grid
        container
        size={{
          xs: 7,
          sm: 8,
        }}
        sx={{
          alignItems: "center",
        }}
      >
        <Typography sx={{ typography: { xs: "caption", sm: "body2" } }}>
          {item.itemName}
        </Typography>
      </Grid>
      <Grid
        container
        size={2}
        sx={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
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
