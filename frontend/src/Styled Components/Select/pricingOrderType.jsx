import { useState } from "react";
import {
  Box,
  Button,
  Divider,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";

import { formatTimeDuration } from "../../Functions/Helper/numberParser";
import { useMediaQuery, useTheme } from "@mui/material";
import ExplainerTooltip from "../Tooltip/ExplainerTooltip";
import BottomSheet from "../Dialogue/BottomSheet";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * A panel header's choice of the order type its figures are quoted on, each option showing its own
 * total and how far that sits from the one in effect.
 *
 * @param {object} props
 * @param {import("../../Functions/MarketData/defaults/orderTypeOptions.js").OrderTypeOption[]} props.options
 * @param {(orderTypeID: string) => void} props.onChange
 * @param {(value: number) => string} props.formatValue - Renders a total as ISK
 * @param {string} [props.label] - What the totals are of, e.g. "Materials"
 * @param {{overridden: number, purchased: number}} [props.usage] - How many rows
 *   depart from this order type, and how many are not estimates at all
 * @param {() => void} [props.onReset] - Puts every row back on this order type
 * @param {number|null} [props.age] - How old the figures are, in milliseconds
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.higherIsBetter] - A larger total is the better one, as with a sale
 * @param {string} [props.totalsCaption] - What the totals are, above the options
 */
export default function PricingOrderTypeSelect({
  options = [],
  onChange,
  formatValue,
  label,
  usage,
  onReset,
  age = null,
  disabled = false,
  higherIsBetter = false,
  totalsCaption = "Figures are this job's total under each",
}) {
  const [anchor, setAnchor] = useState(null);
  const theme = useTheme();
  const asSheet = useMediaQuery(theme.breakpoints.down("sm"));
  const current = options.find((option) => option.isCurrent) ?? options[0];

  if (!current) return null;

  const choose = (orderTypeID) => {
    setAnchor(null);
    if (orderTypeID !== current.id) onChange?.(orderTypeID);
  };

  return (
    <>
      <Button
        size="small"
        color="inherit"
        disabled={disabled}
        endIcon={<ExpandMoreIcon />}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchor)}
        sx={{ color: "secondary.main", textTransform: "none" }}
      >
        {current.label}
      </Button>
      <Options
        asSheet={asSheet}
        anchor={anchor}
        onClose={() => setAnchor(null)}
      >
        {label ? (
          <Typography
            variant="caption"
            sx={{ color: "secondary.main", px: 2, py: 0.5, display: "block" }}
          >
            {label}
          </Typography>
        ) : null}
        <MenuItem disabled sx={{ opacity: "1 !important" }}>
          <Typography variant="caption" color="text.secondary">
            {totalsCaption}
          </Typography>
        </MenuItem>
        {options.map((option) => (
          <MenuItem
            key={option.id}
            role="option"
            aria-selected={option.isCurrent}
            selected={option.isCurrent}
            onClick={() => choose(option.id)}
            sx={{
              gap: 3,
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <Box sx={{ minWidth: 0, maxWidth: 260 }}>
              <Typography variant="body2">{option.label}</Typography>
              {option.caption ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block" }}
                >
                  {option.caption}
                </Typography>
              ) : null}
              {option.description ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", whiteSpace: "normal" }}
                >
                  {option.description}
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="body2">
                {formatValue(option.total)}
              </Typography>
              <OrderTypeDelta
                delta={option.delta}
                formatValue={formatValue}
                higherIsBetter={higherIsBetter}
              />
            </Box>
          </MenuItem>
        ))}
        <OrderTypeUsage usage={usage} onReset={onReset} />
        <PriceAge age={age} />
      </Options>
    </>
  );
}

/**
 * How many rows are not on this order type, with a reset where some were overridden.
 *
 * @param {object} props
 * @param {{overridden: number, purchased: number}} [props.usage]
 * @param {() => void} [props.onReset]
 */
function OrderTypeUsage({ usage, onReset }) {
  if (!usage || (!usage.overridden && !usage.purchased)) return null;

  const parts = [];
  if (usage.overridden) parts.push(`${usage.overridden} overridden`);
  if (usage.purchased) parts.push(`${usage.purchased} purchased`);

  return (
    <Box>
      <Divider sx={{ my: 0.5 }} />
      <Box
        sx={{ px: 2, py: 0.5, display: "flex", alignItems: "center", gap: 2 }}
      >
        <Typography variant="caption" color="text.secondary">
          {parts.join(" \u00b7 ")}
        </Typography>
        {usage.overridden && onReset ? (
          <ExplainerTooltip title="Puts every row back on this panel's market and order type, clearing the ones that departed">
            <Button size="small" onClick={onReset}>
              Reset overrides
            </Button>
          </ExplainerTooltip>
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * How far an option sits from the order type in effect, coloured by whether that is better; the
 * option in effect shows nothing.
 *
 * @param {object} props
 * @param {number} props.delta
 * @param {(value: number) => string} props.formatValue
 * @param {boolean} props.higherIsBetter
 */
function OrderTypeDelta({ delta, formatValue, higherIsBetter }) {
  if (!delta) return null;

  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        color: delta < 0 !== higherIsBetter ? "success.main" : "error.main",
      }}
    >
      {delta < 0 ? "−" : "+"}
      {formatValue(Math.abs(delta))}
    </Typography>
  );
}

/**
 * How old the figures behind these totals are.
 *
 * @param {object} props
 * @param {number|null} props.age - Milliseconds
 */
function PriceAge({ age }) {
  if (age === null || !Number.isFinite(age)) return null;

  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ px: 2, py: 0.5, display: "block" }}
    >
      Server prices {formatTimeDuration(age / 1000, { seconds: false })} old
    </Typography>
  );
}

/**
 * The option list, as a sheet on a phone and an anchored menu otherwise.
 *
 * @param {object} props
 */
function Options({ asSheet, anchor, onClose, children }) {
  if (!asSheet) {
    return (
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={onClose}
        slotProps={{ list: { role: "listbox", dense: true } }}
      >
        {children}
      </Menu>
    );
  }

  return (
    <BottomSheet
      open={Boolean(anchor)}
      onClose={onClose}
      contentProps={{ role: "listbox" }}
    >
      {children}
    </BottomSheet>
  );
}
