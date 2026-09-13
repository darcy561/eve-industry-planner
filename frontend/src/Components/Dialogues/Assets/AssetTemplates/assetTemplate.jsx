import { Avatar, Badge, Box, Tooltip } from "@mui/material";

import { appShellNestedCardSx } from "../../../../Context/appShell";
import {
  assetImageUrl,
  assetName,
} from "../../../../Functions/Assets/assetPresentation";
import { ownerName } from "../../../../Functions/Shared/eveOwner";
import OwnerAvatar from "../../../../Styled Components/Avatar/OwnerAvatar";
import { Figure } from "../../../../Styled Components/Typography/figures";
import { useItemList } from "../../../../Hooks/Static/useItems";

/**
 * One stack of what was asked for.
 *
 * @param {{branch: Object, showOwner?: boolean}} props
 */
export default function AssetTemplate_AssetDialogueWindow({
  branch,
  showOwner = false,
}) {
  const { records: itemRecords } = useItemList();
  const { node } = branch;
  const itemName = assetName(node, itemRecords);
  const holder = showOwner ? ownerName(node.owner) : "";

  return (
    <Tooltip
      title={[itemName, holder].filter(Boolean).join(" \u2014 ")}
      arrow
      placement="top"
    >
      <Box
        sx={[
          appShellNestedCardSx,
          {
            // Not the `border` shorthand: it would reset the tinted colour the token sets.
            borderWidth: 1,
            borderStyle: "solid",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            minWidth: 72,
          },
        ]}
      >
        {showOwner ? (
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            badgeContent={<OwnerAvatar owner={node.owner} size={18} />}
          >
            <Avatar
              src={assetImageUrl(node, itemRecords)}
              alt={itemName}
              variant="square"
            />
          </Badge>
        ) : (
          <Avatar
            src={assetImageUrl(node, itemRecords)}
            alt={itemName}
            variant="square"
          />
        )}
        <Figure variant="caption" formatOptions={{ max: 0 }}>
          {node.quantity}
        </Figure>
      </Box>
    </Tooltip>
  );
}
