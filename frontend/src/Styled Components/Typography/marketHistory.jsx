import { Typography, Tooltip } from "@mui/material";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import { resolveMarketLinkTarget } from "../../Functions/MarketData/marketLinkTarget.js";
import { showPriceHistoryDialogue } from "../../Events/dialogueEvents";
import useUsersStore from "../../Zustand/usersStore";

/**
 * A clickable typography component that opens the price history dialogue.
 * Displays text that can be clicked to view historical pricing data for an EVE Online item.
 * Automatically determines market region if not provided.
 *
 * @param {Object} props - Component props
 * @param {number} props.itemTypeID - EVE Online type ID of the item to view price history for
 * @param {string|Object} [props.regionID] - Market hub `id` from `MARKET_OPTIONS` or row object. If not provided, uses default market or `MARKET_OPTIONS` row where `regionID` is `DEFAULT_REGION` (The Forge).
 * @param {string} props.text - Text content to display
 * @param {Object} [props.textStyle] - Custom styling for the typography component
 * @param {string} [props.tooltipText="Click to view item price history."] - Text to display in the tooltip
 * @param {string} [props.tooltipPlacement="top"] - Placement of the tooltip relative to the text
 * @returns {JSX.Element} Market history dialogue trigger text component
 */
function MarketHistoryDialogueTriggerText({
  itemTypeID,
  regionID,
  text,
  textStyle,
  tooltipText = "Click to view item price history.",
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
      <Typography
        sx={{ cursor: "pointer", ...textStyle }}
        onClick={() => {
          showPriceHistoryDialogue(itemTypeID, marketRegion);
        }}
      >
        {text}
      </Typography>
    </Tooltip>
  );
}

export default MarketHistoryDialogueTriggerText;
