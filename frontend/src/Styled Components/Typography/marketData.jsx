import { Typography, Tooltip } from "@mui/material";
import { showMarketDataDialogue } from "../../Events/dialogueEvents";
import useUsersStore from "../../Zustand/usersStore";
import GLOBAL_CONFIG from "../../global-config-app";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

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
}) {
  if (!locationID) {
    locationID = MARKET_OPTIONS.find(
      (i) =>
        i.id ===
        useUsersStore.getState().applicationSettings.defaultMarketLocation
    );
  }

  if (typeof locationID === "string") {
    locationID = MARKET_OPTIONS.find((i) => i.id === locationID);
  }

  return (
    <Tooltip title={tooltipText} arrow placement={tooltipPlacement}>
      <Typography
        sx={{ cursor: "pointer", ...textStyle }}
        onClick={() => {
          showMarketDataDialogue(itemTypeID, locationID);
        }}
      >
        {text}
      </Typography>
    </Tooltip>
  );
}

export default MarketDataDialogueTriggerText;
