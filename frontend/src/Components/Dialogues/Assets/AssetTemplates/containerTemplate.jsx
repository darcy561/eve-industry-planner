import { Typography, Grid } from "@mui/material";

import AssetLocationLogic_AssetDialogueWindow from "./templateLogic";
import { buildAssetName } from "../../../../Functions/Assets/assetHelpers";

export default function AssetContainerTemplate_AssetDialogueWindow(props) {
  const { state, assetObject, matchedAssets } = props;
  const itemName = buildAssetName(assetObject, state.assetLocationNames, state.useCorporationAssets, state.selectedCorporation, state.fullItemList)

  return (
    <Grid container size={12}>
      <Grid size={12}>
        <Typography variant="body2">{itemName}</Typography>
      </Grid>
      <Grid container size={12}>
        {matchedAssets.map((asset) => {
          return (
            <AssetLocationLogic_AssetDialogueWindow
              key={asset.item_id}
              {...props}
              assetObject={asset}
            />
          );
        })}
      </Grid>
    </Grid>
  );
}
