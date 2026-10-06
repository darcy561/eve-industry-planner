import { Box, Typography } from "@mui/material";

import EveImageAvatar from "../Avatar/EveImageAvatar";
import ItemMarketActions from "./marketActions";

/**
 * An item as a table row names it: its icon, then its name carrying the item's market actions, with
 * an optional line beneath saying what kind of item it is.
 *
 * @param {object} props
 * @param {number|string} props.typeID
 * @param {React.ReactNode} props.name
 * @param {React.ReactNode} [props.caption] - Beneath the name, quieter
 * @param {string|object} [props.regionID] - The market the actions open on
 * @param {string} [props.side] - One of PRICING_SIDE, choosing the default market
 * @param {number} [props.size] - The icon's size in pixels
 */
export function ItemName({ typeID, name, caption, regionID, side, size = 22 }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
      <EveImageAvatar
        type={Number(typeID)}
        size={size}
        variant="rounded"
        sx={{ borderRadius: "3px" }}
      />
      <Box sx={{ minWidth: 0 }}>
        <ItemMarketActions
          typeID={Number(typeID)}
          regionID={regionID}
          side={side}
          sx={{ minWidth: 0 }}
        >
          <Typography variant="body2" component="span" noWrap>
            {name}
          </Typography>
        </ItemMarketActions>
        {caption ? (
          <Typography variant="caption" color="text.secondary" component="div">
            {caption}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
