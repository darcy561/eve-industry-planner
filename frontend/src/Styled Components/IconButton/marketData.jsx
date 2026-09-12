import { IconButton, Tooltip } from "@mui/material";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import { resolveMarketLinkTarget } from "../../Functions/MarketData/marketLinkTarget.js";
import { showMarketDataDialogue } from "../../Events/dialogueEvents";
import LocalAtmIcon from "@mui/icons-material/LocalAtm";
import useUsersStore from "../../Zustand/usersStore";

/**
 * An icon button component that opens the market data dialogue for a specific item.
 * Displays current market orders and pricing information for the given item and location.
 *
 * @param {Object} props - Component props
 * @param {number} props.itemTypeID - EVE Online type ID of the item to view market data for
 * @param {string|Object} [props.locationID] - Market location ID or object. If not provided, uses user's default market.
 * @param {Object} [props.iconButtonStyle] - Custom styling for the icon button
 * @param {Object} [props.iconStyle] - Custom styling for the local ATM icon
 * @param {string} [props.tooltipText="Current Market Data"] - Text to display in the tooltip
 * @param {string} [props.tooltipPlacement="top"] - Placement of the tooltip relative to the button
 * @returns {JSX.Element} Market data icon button component
 */
function MarketDataIconButton({
  itemTypeID,
  locationID,
  iconButtonStyle,
  iconStyle,
  tooltipText = "Current Market Data",
  tooltipPlacement = "top",
  side = PRICING_SIDE.BUYING,
}) {
  // Read through the store rather than a snapshot, so a link follows the
  // account's default changing rather than pointing at a stale market.
  const accountPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );
  const marketLocation = resolveMarketLinkTarget({
    given: locationID,
    side,
    accountPricing,
  });

  return (
    <Tooltip title={tooltipText} arrow placement={tooltipPlacement}>
      <IconButton
        color="primary"
        onClick={() => showMarketDataDialogue(itemTypeID, marketLocation)}
        sx={{ ...iconButtonStyle }}
      >
        <LocalAtmIcon sx={{ ...iconStyle }} />
      </IconButton>
    </Tooltip>
  );
}

export default MarketDataIconButton;
