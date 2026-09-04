import { IconButton, Tooltip } from "@mui/material";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import { showAssetsDialogue } from "../../Events/dialogueEvents";

/**
 * An icon button component that opens the assets dialogue for a specific material.
 * Displays a warehouse icon and shows user's assets for the given material type.
 *
 * @param {Object} props - Component props
 * @param {number} props.materialTypeID - EVE Online type ID of the material to view assets for
 * @param {Object} [props.iconButtonStyle] - Custom styling for the icon button
 * @param {Object} [props.iconStyle] - Custom styling for the warehouse icon
 * @param {string} [props.tooltipText="View Material Assets"] - Text to display in the tooltip
 * @param {string} [props.tooltipPlacement="top"] - Placement of the tooltip relative to the button
 * @returns {JSX.Element} Assets icon button component
 */
function AssetsIconButton({
  materialTypeID,
  iconButtonStyle,
  iconStyle,
  tooltipText = "View Material Assets",
  tooltipPlacement = "top",
}) {
  return (
    <Tooltip title={tooltipText} arrow placement={tooltipPlacement}>
      <IconButton
        color="primary"
        onClick={() => showAssetsDialogue(materialTypeID)}
        sx={{ ...iconButtonStyle }}
      >
        <WarehouseIcon sx={{ ...iconStyle }} />
      </IconButton>
    </Tooltip>
  );
}

export default AssetsIconButton;
