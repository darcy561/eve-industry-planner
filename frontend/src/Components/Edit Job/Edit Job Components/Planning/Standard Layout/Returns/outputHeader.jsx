import { Box, Typography } from "@mui/material";

import ItemMarketActions from "../../../../../../Styled Components/Item/marketActions";
import {
  FigureCaption,
  Figure,
} from "../../../../../../Styled Components/Typography/figures";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";

/**
 * What the job makes, and what the market pays for one.
 *
 * Carries the market links, which are the only way to reach an item's price
 * history from this stage, and the item's own icon — how a player recognises
 * what they are looking at before reading a word of it.
 *
 * @param {object} props
 * @param {number} props.typeID
 * @param {string} props.name
 * @param {string} props.priceHubID - The hub the price and the links are for
 * @param {number} props.unitPrice - Sell-side, per unit
 * @param {number} props.quantityProduced - What is left to sell
 */
export default function OutputHeader({
  typeID,
  name,
  priceHubID,
  unitPrice,
  quantityProduced,
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box
        component="img"
        src={`https://images.evetech.net/types/${typeID}/icon?size=32`}
        alt=""
        sx={{ width: 32, height: 32, flexShrink: 0 }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <ItemMarketActions typeID={typeID} regionID={priceHubID}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
        </ItemMarketActions>
        {/* Its own line, said explicitly: the name above sits in the market
            links' wrapper, which is inline-flex, and a caption renders as a
            span — so the two run together on one line without this. */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          Making {formatNumberForLocale(quantityProduced, { max: 0 })} ·{" "}
          {formatNumberForLocale(unitPrice)} each
        </Typography>
      </Box>
      <Box sx={{ textAlign: "right" }}>
        <FigureCaption>Revenue, listed</FigureCaption>
        <Figure sx={{ display: "block" }}>
          {formatNumberForLocale(unitPrice * quantityProduced)}
        </Figure>
      </Box>
    </Box>
  );
}
