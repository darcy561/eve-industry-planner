import { Avatar, Box, Grid, Typography, useMediaQuery } from "@mui/material";
import fullItemList from "../../../../../RawData/fullItemList.json";
import { useAssetHelperHooks } from "../../../../../Hooks/AssetHooks/useAssetHelper";
import { useTheme } from "@emotion/react";
import GLOBAL_CONFIG from "../../../../../global-config-app";

export function AssetEntry_Child({
  assetObject,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  index,
}) {
  const { findAssetImageURL } = useAssetHelperHooks();
  const theme = useTheme();
  const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const itemName =
    fullItemList[assetObject.type_id]?.name ||
    `Unkown Item-${assetObject.type_id}`;

  const marginValue = deviceNotMobile ? 5 : 3;
  const imageURL = findAssetImageURL(assetObject, characterBlueprintsMap);
  const isEvenPosition = index % 2 === 0;

  function calculateRowBackround() {
    const currentTheme = theme.palette.mode;
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
        return theme.palette.secondary.h;
      }
    }
  }

  return (
    <Grid
      container
      item
      xs={12}
      sx={{
        marginLeft: marginValue * depth,
        backgroundColor: calculateRowBackround(),
      }}
    >
      <Grid item xs={1} sx={{ paddingLeft: deviceNotMobile ? 1 : 0 }}>
        <Box
          height="100%"
          display="flex"
          justifyContent="left"
          alignItems="center"
        >
          <Avatar
            src={imageURL}
            alt={itemName}
            variant="square"
            sx={{
              height: deviceNotMobile ? 32 : 24,
              width: deviceNotMobile ? 32 : 24,
            }}
          />
        </Box>
      </Grid>
      <Grid
        item
        xs={8}
        display="flex"
        justifyContent="left"
        alignItems="center"
      >
        <Typography sx={{ typography: deviceNotMobile ? "body2" : "caption" }}>
          {itemName}
        </Typography>
      </Grid>
      <Grid
        item
        xs={3}
        display="flex"
        justifyContent="right"
        alignItems="center"
        sx={{ paddingRight: deviceNotMobile ? 2 : 0 }}
      >
        <Typography
          sx={{
            typography: deviceNotMobile ? "body2" : "caption",
          }}
        >
          {assetObject.quantity.toLocaleString()}
        </Typography>
      </Grid>
    </Grid>
  );
}
