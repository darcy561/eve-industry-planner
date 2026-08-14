import { IconButton, Tooltip } from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import { getWikiUrl } from "../../Functions/Helper/getWikiUrl";

/**
 * Opens the Otter Wiki page for a panel in a new tab.
 */
export default function WikiLinkIconButton({ path, sx = {} }) {
  return (
    <Tooltip
      arrow
      placement="bottom"
      title="Opens the wiki page for this panel in a new tab."
    >
      <IconButton
        sx={sx}
        color="primary"
        aria-label="Open wiki page"
        onClick={() => {
          window.open(getWikiUrl(path), "_blank", "noopener,noreferrer");
        }}
      >
        <HelpOutlineIcon />
      </IconButton>
    </Tooltip>
  );
}
