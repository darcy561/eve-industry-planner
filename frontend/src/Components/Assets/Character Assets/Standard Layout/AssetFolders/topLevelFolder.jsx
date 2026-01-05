import { IconButton, Typography, useMediaQuery, Grid } from "@mui/material";

import { AssetEntry_Selector } from "./displaySelector";
import { useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import uuid from "react-uuid";
import useUsersStore from "../../../../../Zustand/usersStore";

export function AssetEntry_TopLevel({
  locationID,
  assets,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  fullItemList,
}) {
  const [expanded, updateExpanded] = useState(false);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const itemLocationName =
    useUsersStore.getState().worldData.actions.findUniverseData(locationID)
      ?.name || "Unknown Location";

  function toggleClick() {
    updateExpanded((prev) => !prev);
  }

  return (
    <Grid container>
      <Grid container size={12}>
        <Grid
          display="flex"
          justifyContent="center"
          alignItems="center"
          size={{
            xs: 2,
            sm: 1
          }}>
          <IconButton size="small" onClick={toggleClick}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Grid>
        <Grid
          container
          display="flex"
          justifyContent="left"
          alignItems="center"
          size={{
            xs: 10,
            sm: 11
          }}>
          <Typography
            sx={{ typography: deviceNotMobile ? "body1" : "caption" }}
          >
            {itemLocationName}
          </Typography>
        </Grid>
      </Grid>
      {expanded ? (
        <ExpandedAssetDisplay
          locationID={locationID}
          assets={assets}
          assetLocations={assetLocations}
          topLevelAssets={topLevelAssets}
          assetLocationNames={assetLocationNames}
          characterBlueprintsMap={characterBlueprintsMap}
          depth={depth}
          fullItemList={fullItemList}
        />
      ) : null}
    </Grid>
  );
}

function ExpandedAssetDisplay({
  locationID,
  assets,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  fullItemList,
}) {
  assets.sort((a, b) => {
    let aName = fullItemList[a.type_id]?.name;
    let bName = fullItemList[b.type_id]?.name;
    if (!aName || !bName) {
      return 0;
    }
    if (aName < bName) {
      return -1;
    }
    if (aName > bName) {
      return 1;
    }
    return 0;
  });

  return (
    <>
      {assets.map((asset, index) => {
        return (
          <AssetEntry_Selector
            key={uuid()}
            assetObject={asset}
            assetLocations={assetLocations}
            topLevelAssets={topLevelAssets}
            assetLocationNames={assetLocationNames}
            characterBlueprintsMap={characterBlueprintsMap}
            depth={depth}
            index={index}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
