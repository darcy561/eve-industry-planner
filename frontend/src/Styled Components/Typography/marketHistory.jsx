import { Typography, Tooltip } from "@mui/material";
import { showPriceHistoryDialogue } from "../../Events/dialogueEvents";
import useUsersStore from "../../Zustand/usersStore";
import GLOBAL_CONFIG from "../../global-config-app";

const { MARKET_OPTIONS, DEFAULT_REGION } = GLOBAL_CONFIG;

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
}) {
  if (!regionID) {
    regionID =
      MARKET_OPTIONS.find(
        (i) =>
          i.id ===
          useUsersStore.getState().applicationSettings.defaultMarketLocation
      ) ?? MARKET_OPTIONS.find((i) => i.regionID === DEFAULT_REGION);
  }

  if (typeof regionID === "string") {
    regionID = MARKET_OPTIONS.find((i) => i.id === regionID);
  }

  return (
    <Tooltip title={tooltipText} arrow placement={tooltipPlacement}>
      <Typography
        sx={{ cursor: "pointer", ...textStyle }}
        onClick={() => {
          showPriceHistoryDialogue(itemTypeID, regionID);
        }}
      >
        {text}
      </Typography>
    </Tooltip>
  );
}

export default MarketHistoryDialogueTriggerText;
