import { Box, Button, Typography } from "@mui/material";
import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";

import { MarketListingSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketListing";
import { MarketLocationSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketLocation";

/**
 * Where a single material is priced, when it should not follow the panel.
 *
 * The panel's basis picker says how many rows depart from it; this is where one
 * departs. It sits in the row's own drawer rather than in a dialogue listing
 * every material, so a player changes the row they are already looking at.
 *
 * @param {object} props
 * @param {number} props.typeID
 * @param {string|undefined} props.overrideMarket - The row's own hub, if it has one
 * @param {string|undefined} props.overrideListing - The row's own basis, if it has one
 * @param {string} props.panelMarket - What the row falls back to
 * @param {string} props.panelListing
 * @param {(typeID: number, marketID: string|undefined) => void} props.onMarketCommit
 * @param {(typeID: number, listingID: string|undefined) => void} props.onListingCommit
 * @param {(typeID: number) => void} props.onReset
 * @param {boolean} [props.disabled]
 */
export default function RowPricingOverride({
  typeID,
  overrideMarket,
  overrideListing,
  panelMarket,
  panelListing,
  onMarketCommit,
  onListingCommit,
  onReset,
  disabled = false,
}) {
  const hasOverride = Boolean(overrideMarket || overrideListing);

  return (
    <Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        Priced at
      </Typography>
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          alignItems: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ minWidth: 140 }}>
          <MarketLocationSelectApplicationSettings
            side={PRICING_SIDE.BUYING}
            overrideMarketLocation={overrideMarket}
            alternativeDefaultMarketLocation={panelMarket}
            onMarketLocationCommit={(id) => onMarketCommit?.(typeID, id)}
            customFormStyling={{ width: "100%" }}
            labelText="Market"
            disabled={disabled}
          />
        </Box>
        <Box sx={{ minWidth: 140 }}>
          <MarketListingSelectApplicationSettings
            side={PRICING_SIDE.BUYING}
            overrideOrderType={overrideListing}
            alternativeDefaultOrderType={panelListing}
            onOrderTypeCommit={(id) => onListingCommit?.(typeID, id)}
            customFormStyling={{ width: "100%" }}
            labelText="Listing"
            disabled={disabled}
          />
        </Box>
        {hasOverride ? (
          <ExplainerTooltip title="Clears this row's own market and listing, so it is priced by the panel above again">
            <Button
              size="small"
              onClick={() => onReset?.(typeID)}
              disabled={disabled}
            >
              Use panel pricing
            </Button>
          </ExplainerTooltip>
        ) : null}
      </Box>
    </Box>
  );
}
