import { IconButton, Tooltip } from "@mui/material";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import { resolveMarketLinkTarget } from "../../Functions/MarketData/marketLinkTarget.js";
import { showPriceHistoryDialogue } from "../../Events/dialogueEvents";
import TimelineIcon from "@mui/icons-material/Timeline";
import useUsersStore from "../../Zustand/usersStore";

/**
 * An icon button component that opens the price history dialogue for a specific item.
 * Displays historical pricing data and charts for the given item and region.
 *
 * @param {Object} props - Component props
 * @param {number} props.itemTypeID - EVE Online type ID of the item to view price history for
 * @param {string|Object} [props.regionID] - Market hub `id` from `MARKET_OPTIONS` or row object. If not provided, uses default market or `MARKET_OPTIONS` row where `regionID` is `DEFAULT_REGION` (The Forge).
 * @param {Object} [props.iconButtonStyle] - Custom styling for the icon button
 * @param {Object} [props.iconStyle] - Custom styling for the timeline icon
 * @param {string} [props.tooltipText="Item Price History"] - Text to display in the tooltip
 * @param {string} [props.tooltipPlacement="top"] - Placement of the tooltip relative to the button
 * @returns {JSX.Element} Market history icon button component
 */
function MarketHistoryIconButton({
  itemTypeID,
  regionID,
  iconButtonStyle,
  iconStyle,
  tooltipText = "Item Price History",
  tooltipPlacement = "top",
  side = PRICING_SIDE.BUYING,
}) {
  // Read through the store rather than a snapshot, so a link follows the
  // account's default changing rather than pointing at a stale market.
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );
  const marketRegion = resolveMarketLinkTarget({
    given: regionID,
    side,
    accountPricing,
    needsRegion: true,
  });

  return (
    <Tooltip title={tooltipText} arrow placement={tooltipPlacement}>
      <IconButton
        color="primary"
        size="small"
        onClick={() => showPriceHistoryDialogue(itemTypeID, marketRegion)}
        sx={{ ...iconButtonStyle }}
      >
        <TimelineIcon sx={{ ...iconStyle }} />
      </IconButton>
    </Tooltip>
  );
}

export default MarketHistoryIconButton;
