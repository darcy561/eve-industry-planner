import { Typography, Grid } from "@mui/material";

import AssetLocationLogic_AssetDialogWindow from "./templateLogic";
import { useAssetHelperHooks } from "../../../../Hooks/AssetHooks/useAssetHelper";

export default function AssetContainerTemplate_AssetDialogWindow(props) {
  const { state, assetObject, matchedAssets } = props;
  const { buildAssetName } = useAssetHelperHooks();

  const itemName = buildAssetName(assetObject, state.assetLocationNames, state.useCorporationAssets, state.selectedCorporation, state.fullItemList)

  return (
    <Grid container size={12}>
      <Grid size={12}>
        <Typography variant="body2">{itemName}</Typography>
      </Grid>
      <Grid container size={12}>
        {matchedAssets.map((asset) => {
          return (
            <AssetLocationLogic_AssetDialogWindow
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
