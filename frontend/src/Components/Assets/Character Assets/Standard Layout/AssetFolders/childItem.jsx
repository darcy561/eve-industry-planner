import { Avatar, Box, Typography, useMediaQuery, Grid } from "@mui/material";

import { useAssetHelperHooks } from "../../../../../Hooks/AssetHooks/useAssetHelper";
import { useTheme } from "@emotion/react";
import GLOBAL_CONFIG from "../../../../../global-config-app";
import { formatNumberForLocale } from "../../../../../Functions/Helper/numberParser";

export function AssetEntry_Child({
  assetObject,
  assetLocations,
  topLevelAssets,
  assetLocationNames,
  characterBlueprintsMap,
  depth,
  index,
  fullItemList,
}) {
  const { findAssetImageURL } = useAssetHelperHooks();
  const theme = useTheme();
  const { PRIMARY_THEME, SECONDARY_THEME } = GLOBAL_CONFIG;
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  const itemName =
    fullItemList[assetObject.type_id]?.name ||
    `Unknown Item-${assetObject.type_id}`;

  const marginValue = deviceNotMobile ? 5 : 3;
  const imageURL = findAssetImageURL(assetObject, characterBlueprintsMap);
  const isEvenPosition = index % 2 === 0;

  function calculateRowBackground() {
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
        return theme.palette.secondary.highlight;
      }
    }

    return theme.palette.secondary.highlight;
  }

  return (
    <Grid
      container
      sx={{
        marginLeft: marginValue * depth,
        backgroundColor: calculateRowBackground(),
      }}
      size={12}>
      <Grid sx={{ paddingLeft: deviceNotMobile ? 1 : 0 }} size={1}>
        <Box
          sx={{
            height: "100%",
            display: "flex",
            justifyContent: "left",
            alignItems: "center"
          }}>
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
        size={8}
        sx={{
          display: "flex",
          justifyContent: "left",
          alignItems: "center"
        }}>
        <Typography sx={{ typography: deviceNotMobile ? "body2" : "caption" }}>
          {itemName}
        </Typography>
      </Grid>
      <Grid
        size={3}
        sx={{
          display: "flex",
          justifyContent: "right",
          alignItems: "center",
          paddingRight: deviceNotMobile ? 2 : 0
        }}>
        <Typography
          sx={{
            typography: deviceNotMobile ? "body2" : "caption",
          }}
        >
          {formatNumberForLocale(assetObject.quantity, { max: 0 })}
        </Typography>
      </Grid>
    </Grid>
  );
}
