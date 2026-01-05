import { IconButton, Typography, useMediaQuery, Grid } from "@mui/material";

import { useState } from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import uuid from "react-uuid";
import { AssetEntry_CorpOffices } from "./officesParentFolder";
import useUsersStore from "../../../../../Zustand/usersStore";

export function AssetEntry_TopLevel_CorporationOffices({
  locationID,
  assets,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  matchedCorporation,
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
          assets={assets}
          assetLocations={assetLocations}
          topLevelAssets={topLevelAssets}
          assetLocationNames={assetLocationNames}
          characterBlueprintsMap={characterBlueprintsMap}
          matchedCorporation={matchedCorporation}
          depth={depth}
          fullItemList={fullItemList}
        />
      ) : null}
    </Grid>
  );
}

function ExpandedAssetDisplay({
  assets,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  matchedCorporation,
  depth,
  fullItemList,
}) {
  return (
    <>
      {matchedCorporation.hangars.map((hangarObject, index) => {
        return (
          <AssetEntry_CorpOffices
            key={uuid()}
            hangarObject={hangarObject}
            assets={assets}
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
