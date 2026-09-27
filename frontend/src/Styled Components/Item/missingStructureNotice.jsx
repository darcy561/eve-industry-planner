import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Icon, Tooltip } from "@mui/material";

const MISSING_STRUCTURE_NOTICE =
  "The custom structure this was built in has been deleted. The figures shown are the ones it was built with.";

/**
 * Says that the custom structure something was built in is gone, while what it
 * was built with is still shown.
 *
 * @returns {JSX.Element}
 */
export default function MissingStructureNotice() {
  return (
    <Tooltip title={MISSING_STRUCTURE_NOTICE} arrow placement="bottom">
      <Icon color="warning" fontSize="small">
        <WarningAmberIcon fontSize="small" />
      </Icon>
    </Tooltip>
  );
}
