import { Box, Button, Typography } from "@mui/material";
import ExplainerTooltip from "../../../../../../Styled Components/Tooltip/ExplainerTooltip";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";

import { OrderTypeSelectApplicationSettings } from "../../../../../../Styled Components/Select/orderType";
import { MarketLocationSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketLocation";

/**
 * Where a single material is priced, when it should not follow the panel.
 *
 * The panel's order type picker says how many rows depart from it; this is where one
 * departs. It sits in the row's own drawer rather than in a dialogue listing
 * every material, so a player changes the row they are already looking at.
 *
 * @param {object} props
 * @param {number} props.typeID
 * @param {string|undefined} props.overrideMarketLocation - The row's own market, if it has one
 * @param {string|undefined} props.overrideOrderType - The row's own order type, if it has one
 * @param {string} props.panelMarketLocation - What the row falls back to
 * @param {string} props.panelOrderType
 * @param {(typeID: number, marketID: string|undefined) => void} props.onMarketLocationCommit
 * @param {(typeID: number, listingID: string|undefined) => void} props.onOrderTypeCommit
 * @param {(typeID: number) => void} props.onReset
 * @param {boolean} [props.disabled]
 */
export default function RowPricingOverride({
  typeID,
  overrideMarketLocation,
  overrideOrderType,
  panelMarketLocation,
  panelOrderType,
  onMarketLocationCommit,
  onOrderTypeCommit,
  onReset,
  disabled = false,
}) {
  const hasOverride = Boolean(overrideMarketLocation || overrideOrderType);

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
            overrideMarketLocation={overrideMarketLocation}
            alternativeDefaultMarketLocation={panelMarketLocation}
            onMarketLocationCommit={(id) =>
              onMarketLocationCommit?.(typeID, id)
            }
            customFormStyling={{ width: "100%" }}
            labelText="Market"
            disabled={disabled}
          />
        </Box>
        <Box sx={{ minWidth: 140 }}>
          <OrderTypeSelectApplicationSettings
            side={PRICING_SIDE.BUYING}
            overrideOrderType={overrideOrderType}
            alternativeDefaultOrderType={panelOrderType}
            onOrderTypeCommit={(id) => onOrderTypeCommit?.(typeID, id)}
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
