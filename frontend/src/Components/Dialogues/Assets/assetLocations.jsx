import { Box, Typography } from "@mui/material";

import AssetLocationLogic_AssetDialogueWindow from "./AssetTemplates/templateLogic";
import InsetSurface from "../../../Styled Components/Paper/InsetSurface";
import { UNNAMED_LOCATION_LABEL } from "../../../Functions/Assets/assetLocationConstants";

/**
 * Where a material is held: a heading per location, and under it the containers holding it.
 *
 * @param {{locations: Array<Object>, containerNames: Map, compartmentNames: Map, showOwner?: boolean}} props
 */
export default function AssetLocations_AssetDialogueWindow({
  locations,
  containerNames,
  compartmentNames,
  showOwner,
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {locations.map(({ locationId, name, rows }) => (
        <Box key={locationId}>
          <InsetSurface
            sx={{
              paddingX: 1.5,
              paddingY: 0.75,
              marginBottom: 1,
            }}
          >
            <Typography noWrap sx={{ fontWeight: 600 }}>
              {name || UNNAMED_LOCATION_LABEL}
            </Typography>
          </InsetSurface>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: 1.5,
              paddingLeft: 1,
            }}
          >
            {rows.map((branch) => (
              <AssetLocationLogic_AssetDialogueWindow
                key={branch.node.itemId}
                branch={branch}
                containerNames={containerNames}
                compartmentNames={compartmentNames}
                showOwner={showOwner}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
