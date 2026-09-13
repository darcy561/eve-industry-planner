import { useState } from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";

import { formatTimeDuration } from "../../Functions/Helper/numberParser";
import { useMediaQuery, useTheme } from "@mui/material";
import ExplainerTooltip from "../Tooltip/ExplainerTooltip";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

/**
 * Chooses which of the four server-served price modes a panel's figures are
 * quoted on, showing what each does to the total it governs.
 *
 * Built for an `AppShellPanel` `action`, so it reads as a header control rather
 * than a form field: the panel already says what the figure is, and this says
 * what it is measured on.
 *
 * The effect is the point. A mode named alone is jargon — the trimmed percentile
 * figures especially — so each option carries its own total and how far that sits
 * from the one in effect.
 *
 * @param {object} props
 * @param {import("../../Functions/MarketData/materialPricing").BasisOption[]} props.options
 * @param {(basisID: string) => void} props.onChange
 * @param {(value: number) => string} props.formatValue - Renders a total as ISK
 * @param {string} [props.label] - What the totals are of, e.g. "Materials"
 * @param {{overridden: number, purchased: number}} [props.usage] - How many rows
 *   depart from this basis, and how many are not estimates at all
 * @param {() => void} [props.onReset] - Puts every row back on this basis
 * @param {number|null} [props.age] - How old the figures are, in milliseconds
 * @param {boolean} [props.disabled]
 */
export default function PricingBasisSelect({
  options = [],
  onChange,
  formatValue,
  label,
  usage,
  onReset,
  age = null,
  disabled = false,
}) {
  const [anchor, setAnchor] = useState(null);
  // An anchored menu at 360px opens against the edge of the screen. A sheet
  // comes up under the thumb and gives each option a full-width row, which is
  // where this picker gains most: the figure beside each mode is the reason to
  // prefer one.
  const theme = useTheme();
  const asSheet = useMediaQuery(theme.breakpoints.down("sm"));
  const current = options.find((option) => option.isCurrent) ?? options[0];

  if (!current) return null;

  const choose = (basisID) => {
    setAnchor(null);
    if (basisID !== current.id) onChange?.(basisID);
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
            Figures are this job's total under each
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
              <BasisDelta delta={option.delta} formatValue={formatValue} />
            </Box>
          </MenuItem>
        ))}
        <BasisUsage usage={usage} onReset={onReset} />
        <PriceAge age={age} />
      </Options>
    </>
  );
}

/**
 * How many rows are not on this basis.
 *
 * An override is invisible on the row itself, so saying how many there are is
 * what makes one discoverable without opening anything.
 *
 * @param {object} props
 * @param {{overridden: number, purchased: number}} [props.usage]
 * @param {() => void} [props.onReset]
 */
function BasisUsage({ usage, onReset }) {
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
          <ExplainerTooltip title="Puts every row back on this panel's market and basis, clearing the ones that departed">
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
 * How far an option sits from the basis in effect. Colour marks sign only, and
 * the option in effect shows nothing rather than a zero.
 *
 * @param {object} props
 * @param {number} props.delta
 * @param {(value: number) => string} props.formatValue
 */
function BasisDelta({ delta, formatValue }) {
  if (!delta) return null;

  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        color: delta < 0 ? "success.main" : "error.main",
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
 * The server refreshes on a period measured in hours, and a price from this
 * morning looks exactly as authoritative as one from a minute ago. Stating the
 * age is the only thing that tells them apart.
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
    <Drawer
      anchor="bottom"
      open={Boolean(anchor)}
      onClose={onClose}
      slotProps={{
        paper: { sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12 } },
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 4,
          borderRadius: 2,
          bgcolor: "divider",
          mx: "auto",
          mt: 1,
        }}
      />
      <Box role="listbox" sx={{ pb: 2 }}>
        {children}
      </Box>
    </Drawer>
  );
}
