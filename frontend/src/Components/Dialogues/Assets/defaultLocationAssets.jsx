import { Typography, Grid } from "@mui/material";

import AssetLocationLogic_AssetDialogWindow from "./AssetTemplates/templateLogic";
import useUsersStore from "../../../Zustand/usersStore";

export default function DefaultLocationAssets(props) {
  const { state } = props;
  const defaultAssetLocation = useUsersStore(
    (state) => state.applicationSettings.defaultStationIDForAssets
  );

  if (
    !state.topLevelAssets ||
    !state.assetLocations ||
    !state.assetLocationNames ||
    state.isLoading
  )
    return null;

  const locationAssets = state.topLevelAssets.get(defaultAssetLocation);

  if (!locationAssets) return null;

  return (
    <>
      {Array.from(state.topLevelAssets).map(([locationID, assets]) => {
        if (locationID !== defaultAssetLocation) return null;

        const itemLocationName =
          useUsersStore.getState().worldData.universeIDs[locationID]?.name || "Unkown Location";

        return (
          <Grid key={locationID} container>
            <Grid size={12}>
              <Typography>{itemLocationName} </Typography>
            </Grid>
            {assets.map((assetObject) => {
              return (
                <AssetLocationLogic_AssetDialogWindow
                  key={assetObject.item_id}
                  {...props}
                  assetObject={assetObject}
                />
              );
            })}
          </Grid>
        );
      })}
    </>
  );
}
