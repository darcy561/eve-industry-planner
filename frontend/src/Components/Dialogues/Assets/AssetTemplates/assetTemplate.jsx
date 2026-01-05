import { Avatar, Box, Typography, Grid } from "@mui/material";

import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";

export default function AssetTemplate_AssetDialogWindow(props) {
  const { state, assetObject } = props;
  const { findAssetImageURL } = useAssetHelperHooks();
  if (!assetObject) return null;

  const itemName =
    state.fullItemList[assetObject.type_id]?.name ||
    `Unknown Item-${assetObject.type_id}`;

  const imageURL = findAssetImageURL(assetObject);

  return (
    <Grid container size={2}>
      <Grid size={12}>
        <Box
          height="100%"
          display="flex"
          justifyContent="left"
          alignItems="center"
        >
          <Avatar src={imageURL} alt={itemName} variant="square" />
        </Box>
      </Grid>
      <Grid size={12}>
        <Typography variant="caption">
          {formatNumberForLocale(assetObject.quantity, { max: 0 })}
        </Typography>
      </Grid>
    </Grid>
  );
}
