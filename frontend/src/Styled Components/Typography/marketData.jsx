import { Typography, Tooltip } from "@mui/material";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import { resolveMarketLinkTarget } from "../../Functions/MarketData/marketLinkTarget.js";
import { showMarketDataDialogue } from "../../Events/dialogueEvents";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A clickable typography component that opens the market data dialogue.
 * Displays text that can be clicked to view current market data for an EVE Online item.
 * Automatically determines market location if not provided.
 *
 * @param {Object} props - Component props
 * @param {number} props.itemTypeID - EVE Online type ID of the item to view market data for
 * @param {string|Object} [props.locationID] - Market location ID or object. If not provided, uses user's default market.
 * @param {string} props.text - Text content to display
 * @param {Object} [props.textStyle] - Custom styling for the typography component
 * @param {string} [props.tooltipText="Click to view item market data."] - Text to display in the tooltip
 * @param {string} [props.tooltipPlacement="top"] - Placement of the tooltip relative to the text
 * @returns {JSX.Element} Market data dialogue trigger text component
 */
function MarketDataDialogueTriggerText({
  itemTypeID,
  locationID,
  text,
  textStyle,
  tooltipText = "Click to view item market data.",
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
      <Typography
        sx={{ cursor: "pointer", ...textStyle }}
        onClick={() => {
          showMarketDataDialogue(itemTypeID, marketLocation);
        }}
      >
        {text}
      </Typography>
    </Tooltip>
  );
}

export default MarketDataDialogueTriggerText;
