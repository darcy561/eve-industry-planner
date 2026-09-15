import { Typography, Grid, Checkbox, Tooltip } from "@mui/material";

import { LARGE_TEXT_FORMAT } from "../../../Context/defaultValues";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import EveImageAvatar from "../../../Styled Components/Avatar/EveImageAvatar";

export function ShoppingListItem_ShoppingListDialogue({
  item,
  actions,
  isEven = false,
}) {
  const { typeID, name } = item;

  const assetQuantityText = Math.max(
    item.quantityToPurchase - item.assetQuantity,
    0,
  );

  const handleToggle = () => {
    actions.toggleIncludeWhenCopying(typeID);
  };

  return (
    <Grid
      container
      size={12}
      sx={{
        justifyContent: "center",
        alignItems: "center",
        marginBottom: { xs: "1px", sm: "0px" },
        backgroundColor: isEven ? "rgba(0, 0, 0, 0.06)" : "transparent",
      }}
    >
      <Grid
        align="center"
        size={{
          xs: 2,
          sm: 1,
        }}
        sx={{
          paddingRight: { xs: "5px", sm: 0 },
        }}
      >
        <Tooltip
          title="Include when copying to clipboard"
          arrow
          placement="bottom"
        >
          <Checkbox
            checked={item.includeWhenCopying !== false}
            onChange={handleToggle}
            size="small"
          />
        </Tooltip>
      </Grid>
      <Grid
        sx={{
          display: { xs: "none", sm: "block" },
          paddingRight: "5px",
        }}
        align="center"
        size={{
          sm: 1,
        }}
      >
        <EveImageAvatar type={typeID} alt={name} size={32} variant="square" />
      </Grid>
      <Grid
        size={{
          xs: 6,
          sm: 6,
        }}
      >
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>{name}</Typography>
      </Grid>
      <Grid size={4}>
        <Typography sx={{ typography: LARGE_TEXT_FORMAT }} align="right">
          {formatNumberForLocale(assetQuantityText, { max: 0 })}
        </Typography>
      </Grid>
    </Grid>
  );
}
