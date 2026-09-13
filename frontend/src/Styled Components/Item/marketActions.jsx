import { useState, useRef, useEffect } from "react";
import { Box, Paper, Popper, Fade } from "@mui/material";
import { PRICING_SIDE } from "../../Functions/MarketData/pricingSide.js";
import MarketDataIconButton from "../IconButton/marketData";
import MarketHistoryIconButton from "../IconButton/marketHistory";
import AssetsIconButton from "../IconButton/assets";
import useUsersStore from "../../Zustand/usersStore";

// Long enough to cross the gap between the name and the card without the card
// vanishing on the way.
const CLOSE_DELAY = 150;

const BUTTON_SX = { p: 0.5 };
const ICON_SX = { fontSize: "1.35rem" };

/**
 * An item's market actions — current market data, price history, and the
 * player's own assets. The one place these three are put together.
 *
 * Given a name, they appear in a small card above it while the pointer is on
 * either, or while something inside has focus. Given nothing to name the item —
 * a card's actions row, a panel header — there is nothing to hover, so they sit
 * inline as the content itself.
 *
 * Built on `Popper` rather than `Popover`: a `Popover` is a `Modal`, and its
 * invisible backdrop covers the viewport, swallowing the pointer leave that
 * should close this. `Popper` only positions.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.children] - The item's name; omit where the actions stand alone.
 * @param {number} props.typeID - EVE type ID of the item.
 * @param {string|object} [props.regionID] - Market hub to link to; the account default when absent.
 * @param {string} [props.side] - One of PRICING_SIDE, deciding which default market a link opens.
 * @param {string} [props.tooltipPlacement] - Where each action's tooltip sits.
 * @param {object} [props.sx] - Styling for the wrapper holding the name.
 * @returns {JSX.Element}
 */
export default function ItemMarketActions({
  children,
  typeID,
  regionID,
  side = PRICING_SIDE.BUYING,
  tooltipPlacement = "top",
  sx,
}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const [anchorEl, setAnchorEl] = useState(null);
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const actions = (
    <>
      <MarketDataIconButton
        itemTypeID={typeID}
        locationID={regionID}
        side={side}
        tooltipPlacement={tooltipPlacement}
        iconButtonStyle={BUTTON_SX}
        iconStyle={ICON_SX}
      />
      <MarketHistoryIconButton
        itemTypeID={typeID}
        regionID={regionID}
        side={side}
        tooltipPlacement={tooltipPlacement}
        iconButtonStyle={BUTTON_SX}
        iconStyle={ICON_SX}
      />
      {isLoggedIn && (
        <AssetsIconButton
          materialTypeID={typeID}
          tooltipPlacement={tooltipPlacement}
          iconButtonStyle={BUTTON_SX}
          iconStyle={ICON_SX}
        />
      )}
    </>
  );

  // With no name to hover, a floating card has nothing to appear from.
  if (!children) {
    return (
      <Box
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, ...sx }}
      >
        {actions}
      </Box>
    );
  }

  const show = (event) => {
    clearTimeout(closeTimer.current);
    setAnchorEl(event.currentTarget);
  };

  // Delayed so the pointer can travel from the name to the card, which sits a
  // few pixels above it.
  const hide = () => {
    closeTimer.current = setTimeout(() => setAnchorEl(null), CLOSE_DELAY);
  };

  return (
    <Box
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        minWidth: 0,
        // It is focusable only to reach the actions, so it takes the theme's
        // focus ring rather than the browser's default outline on a text run.
        borderRadius: 1,
        "&:focus-visible": {
          outline: (theme) => `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
        ...sx,
      }}
    >
      {children}
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="top"
        transition
        modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
        sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={150}>
            <Paper
              elevation={6}
              onMouseEnter={() => clearTimeout(closeTimer.current)}
              onMouseLeave={hide}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                px: 0.5,
                py: 0.25,
                borderRadius: 2,
              }}
            >
              {actions}
            </Paper>
          </Fade>
        )}
      </Popper>
    </Box>
  );
}
