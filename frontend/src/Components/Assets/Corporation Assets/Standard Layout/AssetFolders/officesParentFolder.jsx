import { useState } from "react";
import {
  Grid,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { AssetEntry_Selector } from "../../../Character Assets/Standard Layout/AssetFolders/displaySelector";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import uuid from "react-uuid";
import GLOBAL_CONFIG from "../../../../../global-config-app";

export function AssetEntry_CorpOffices({
  hangarObject,
  assets,
  assetLocations,
  assetLocationNames,
  topLevelAssets,
  characterBlueprintsMap,
  depth,
  index,
  fullItemList,
}) {
  const [expanded, updateExpanded] = useState(false);
  const hangarAssets = assets.get(hangarObject.assetLocationRef);
  const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;
  const theme = useTheme();

  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const marginValue = deviceNotMobile ? 5 : 3;
  const bottomPaddingValue = deviceNotMobile ? 1 : 2;

  function calculateRowBackground() {
    const currentTheme = theme.palette.mode;
    const isEvenPosition = index % 2 === 0;
    if (currentTheme === PRIMARY_THEME) {
      if (isEvenPosition) {
        return theme.palette.secondary.dark;
      } else {
        return theme.palette.secondary.highlight;
      }
    }

    if (currentTheme === SECONDARY_THEME) {
      if (isEvenPosition) {
        return theme.palette.secondary.light;
      } else {
        return theme.palette.secondary.highlight;
      }
    }

    return theme.palette.secondary.highlight;
  }

  function toggleClick() {
    updateExpanded((prev) => !prev);
  }

  return (
    <Grid
      container
      sx={{
        paddingBottom: expanded ? bottomPaddingValue : 0,
        marginLeft: marginValue * depth,
        backgroundColor: calculateRowBackground(),
      }}
      size={12}
    >
      <Grid container size={12}>
        <Grid
          size={10}
          sx={{
            display: "flex",
            justifyContent: "left",
            alignItems: "center",
            paddingLeft: deviceNotMobile ? 1 : 0
          }}>
          <Typography
            sx={{ typography: deviceNotMobile ? "body1" : "caption" }}
          >
            {hangarObject.name}
          </Typography>
        </Grid>
        <Grid
          size={{
            xs: 2,
            sm: 1,
          }}
          sx={{
            display: "flex",
            justifyContent: "right",
            alignItems: "center",
            paddingRight: deviceNotMobile ? 2 : 1
          }}>
          <IconButton size="small" onClick={toggleClick}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Grid>
      </Grid>
      {expanded ? (
        <ExpandedAssetDisplay
          hangarAssets={hangarAssets}
          assetLocations={assetLocations}
          assetLocationNames={assetLocationNames}
          topLevelAssets={topLevelAssets}
          characterBlueprintsMap={characterBlueprintsMap}
          depth={depth}
          fullItemList={fullItemList}
        />
      ) : null}
    </Grid>
  );
}

function ExpandedAssetDisplay({
  hangarAssets,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  fullItemList,
}) {
  hangarAssets.sort((a, b) => {
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

  if (hangarAssets.length === 0) {
    return (
      <Grid align="center" size={12}>
        <Typography variant="caption">No Corporation Assets Found</Typography>
      </Grid>
    );
  }
  return (
    <>
      {hangarAssets.map((asset, index) => {
        return (
          <AssetEntry_Selector
            key={uuid()}
            assetObject={asset}
            assetLocations={assetLocations}
            topLevelAssets={topLevelAssets}
            assetLocationNames={assetLocationNames}
            characterBlueprintsMap={characterBlueprintsMap}
            depth={depth + 1}
            index={index}
            fullItemList={fullItemList}
          />
        );
      })}
    </>
  );
}
