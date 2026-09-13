import { Avatar, Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import AssetLocationLogic_AssetDialogueWindow from "./templateLogic";
import {
  assetImageUrl,
  assetName,
} from "../../../../Functions/Assets/assetPresentation";
import { ownerName } from "../../../../Functions/Shared/eveOwner";
import OwnerAvatar from "../../../../Styled Components/Avatar/OwnerAvatar";
import { useItemList } from "../../../../Hooks/Static/useItems";

/**
 * A container holding what was asked for, and what is inside it.
 *
 * @param {{branch: Object, containerNames: Map, compartmentNames: Map, showOwner?: boolean}} props
 */
export default function AssetContainerTemplate_AssetDialogueWindow({
  branch,
  containerNames,
  compartmentNames,
  showOwner = false,
}) {
  const { records: itemRecords } = useItemList();
  const itemName = assetName(
    branch.node,
    itemRecords,
    containerNames,
    compartmentNames?.get(branch.node.rootFlag),
  );

  return (
    <Box
      sx={{
        width: "100%",
        borderLeft: (theme) =>
          `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
        paddingLeft: 1.5,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          marginBottom: 0.5,
        }}
      >
        <Avatar
          src={assetImageUrl(branch.node, itemRecords)}
          alt=""
          variant="square"
          sx={{ height: 24, width: 24 }}
        />
        <Typography variant="body2" color="text.secondary">
          {itemName}
        </Typography>
        {showOwner && (
          <>
            <OwnerAvatar owner={branch.node.owner} size={18} />
            <Typography variant="caption" color="text.secondary">
              {ownerName(branch.node.owner)}
            </Typography>
          </>
        )}
      </Box>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 1.5,
        }}
      >
        {branch.children.map((child) => (
          <AssetLocationLogic_AssetDialogueWindow
            key={child.node.itemId}
            branch={child}
            containerNames={containerNames}
            compartmentNames={compartmentNames}
            showOwner={showOwner}
          />
        ))}
      </Box>
    </Box>
  );
}
