import { useState } from "react";
import { Box, Collapse, Link, Skeleton, Typography } from "@mui/material";
import { ExpandToggle } from "../IconButton/ExpandToggle";

import {
  formatNumberForLocale,
  formatPercentage,
} from "../../Functions/Helper/numberParser";

/**
 * How a figure is marked against the figures beside it.
 *
 * @enum {string}
 */
export const FIGURE_TONE = {
  PLAIN: "plain",
  /** The better of a pair — the cheaper price, the larger return. */
  GOOD: "good",
  /** The worse of a pair, or a cost that has grown. */
  BAD: "bad",
  /** Right, but worth a second look. */
  WARN: "warn",
};

const TONE_COLOUR = {
  [FIGURE_TONE.PLAIN]: "text.primary",
  [FIGURE_TONE.GOOD]: "success.main",
  [FIGURE_TONE.BAD]: "error.main",
  [FIGURE_TONE.WARN]: "warning.main",
};

/**
 * The theme colour a tone resolves to, for an icon, border or chart series beside a figure.
 *
 * @param {string} tone - One of FIGURE_TONE
 * @returns {string} A theme palette path
 */
export function figureToneColour(tone) {
  return TONE_COLOUR[tone] ?? TONE_COLOUR[FIGURE_TONE.PLAIN];
}

/**
 * A number lined up with those around it, formatted for the locale when raw, and an em dash
 * for a value the app does not have.
 *
 * @param {object} props
 * @param {React.ReactNode} [props.children] - The value, formatted or raw
 * @param {{min?: number, max?: number}} [props.formatOptions] - Decimal places
 *   for a raw numeric child; see `formatNumberForLocale`
 * @param {string} [props.tone] - One of FIGURE_TONE
 * @param {string} [props.variant] - MUI typography variant
 * @param {object} [props.sx]
 */
export function Figure({
  children,
  tone = FIGURE_TONE.PLAIN,
  variant = "body2",
  formatOptions,
  sx,
  ...rest
}) {
  const absent = children === null || children === undefined || children === "";
  const value =
    typeof children === "number"
      ? formatNumberForLocale(children, formatOptions)
      : children;

  return (
    <Typography
      component="span"
      variant={variant}
      sx={{
        fontVariantNumeric: "tabular-nums",
        color: absent ? "text.disabled" : TONE_COLOUR[tone],
        ...sx,
      }}
      {...rest}
    >
      {absent ? "—" : value}
    </Typography>
  );
}

/**
 * A change, given as a fraction and shown as a percentage, coloured by which way it went.
 *
 * @param {object} props
 * @param {number|null} props.value - A fraction: -0.083 renders as −8.3%
 * @param {boolean} [props.lowerIsBetter] - Whether a fall is the good direction
 * @param {number} [props.places]
 * @param {string} [props.variant]
 */
export function SignedPercent({
  value,
  lowerIsBetter = true,
  places = 1,
  variant = "body2",
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <Figure variant={variant} />;
  }

  const fell = value < 0;
  const good = fell === lowerIsBetter;

  return (
    <Figure variant={variant} tone={good ? FIGURE_TONE.GOOD : FIGURE_TONE.BAD}>
      {`${fell ? "−" : "+"}${formatPercentage(Math.abs(value), { places })}`}
    </Figure>
  );
}

/**
 * How a row that closes a block is drawn: ruled above, so it reads as the sum of what is over it.
 *
 * @type {object}
 */
export const totalRowSx = {
  borderTop: 1,
  borderColor: "divider",
  fontWeight: 500,
};

/**
 * Names a group of rows beneath it, in a table's band or a stack of rows alike.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.tone] - One of FIGURE_TONE
 */
export function BandCaption({ children, tone = FIGURE_TONE.PLAIN }) {
  return (
    <Figure
      tone={tone}
      variant="caption"
      sx={{
        display: "block",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Figure>
  );
}

/**
 * A label and its figure on one line, with an optional sub-label, or ruled as a block's total.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {React.ReactNode} [props.sublabel] - Under the label, quieter
 * @param {React.ReactNode} props.value - Already formatted
 * @param {string} [props.tone] - One of FIGURE_TONE, for the value
 * @param {boolean} [props.isTotal] - Closes a block: ruled above, not below
 * @param {React.ReactNode} [props.marker] - A dot or swatch before the label
 */
export function FigureRow({
  label,
  sublabel,
  value,
  tone = FIGURE_TONE.PLAIN,
  isTotal = false,
  marker,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 2,
        py: 0.75,
        ...(isTotal
          ? { ...totalRowSx, mt: 0.5 }
          : { borderBottom: 1, borderColor: "divider" }),
        "&:last-of-type": isTotal ? {} : { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" component="span">
          {marker}
          {label}
        </Typography>
        {sublabel ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {sublabel}
          </Typography>
        ) : null}
      </Box>
      <Figure tone={tone} sx={isTotal ? { fontWeight: 500 } : undefined}>
        {value}
      </Figure>
    </Box>
  );
}

/**
 * A quiet line under a panel, stating what it holds on the left and a total on the right.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - The left side
 * @param {React.ReactNode} [props.value] - The right side
 */
export function PanelFooterMeta({ children, value }) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {children}
      </Typography>
      {value === undefined ? null : (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}

/**
 * A caption above a figure, naming what it is.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function FigureCaption({ children }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        display: "block",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * The figure a panel leads with: what it is, then the number, large.
 *
 * @param {object} props
 * @param {React.ReactNode} props.caption - What the figure is
 * @param {React.ReactNode} props.value - Already formatted
 * @param {string} [props.tone] - One of FIGURE_TONE
 * @param {'lead'|'beside'} [props.size] - The figure a panel opens with, or one
 *   of the smaller ones standing next to it
 * @param {React.ReactNode} [props.children] - Shown under the figure
 */
export function HeadlineStat({
  caption,
  value,
  tone = FIGURE_TONE.PLAIN,
  size = "lead",
  children,
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <FigureCaption>{caption}</FigureCaption>
      <Figure
        tone={tone}
        variant={size === "lead" ? "h5" : "body1"}
        sx={{ display: "block", fontWeight: 500, letterSpacing: "-0.02em" }}
      >
        {value}
      </Figure>
      {children}
    </Box>
  );
}

/**
 * What a panel opens with: the figure it leads on, and whatever stands beside it.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - The lead figure
 * @param {React.ReactNode} [props.aside] - What stands beside it
 */
export function PanelHeadline({ children, aside }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2.25,
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      {children}
      {aside ? (
        <Box
          sx={{
            display: "flex",
            gap: 3,
            flexWrap: "wrap",
            flexGrow: 1,
            minWidth: 0,
            justifyContent: "flex-end",
          }}
        >
          {aside}
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * A measure on its own card: what it is, what it is now, how that compares, and what it was
 * before.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label - What the measure is
 * @param {React.ReactNode} props.value - Already formatted
 * @param {string} [props.tone] - One of FIGURE_TONE, for the value
 * @param {React.ReactNode} [props.icon] - Sits before the value, sized to it
 * @param {React.ReactNode} [props.change] - Beside the value, e.g. "+12.4%"
 * @param {string} [props.changeTone] - One of FIGURE_TONE, for the change
 * @param {React.ReactNode} [props.comparison] - Under the figure, quieter
 * @param {boolean} [props.isLoading] - Shows the tile's shape rather than zeroes
 */
export function StatTile({
  label,
  value,
  tone = FIGURE_TONE.PLAIN,
  icon,
  change,
  changeTone = FIGURE_TONE.PLAIN,
  comparison,
  isLoading = false,
}) {
  if (isLoading) {
    return (
      <Box>
        <Skeleton width="60%" />
        <Skeleton width="80%" height={36} />
        <Skeleton width="70%" />
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        color="text.secondary"
        sx={{ typography: { xs: "caption", md: "body2" } }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          mt: 0.5,
        }}
      >
        {icon}
        <Figure
          tone={tone}
          sx={{
            typography: { xs: "h6", md: "h5" },
            width: "fit-content",
            lineHeight: 1.2,
          }}
        >
          {value}
        </Figure>
        {change === undefined || change === null ? null : (
          <Figure
            tone={changeTone}
            variant="caption"
            sx={{ ml: 0.75, lineHeight: 1.2 }}
          >
            {change}
          </Figure>
        )}
      </Box>
      {comparison === undefined || comparison === null ? null : (
        <Typography
          sx={{
            typography: "caption",
            mt: 0.25,
            width: "fit-content",
            color: "text.secondary",
          }}
        >
          {comparison}
        </Typography>
      )}
    </Box>
  );
}

/**
 * A relationship between two figures, stated quietly as context rather than as a result.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - What the relationship is
 * @param {React.ReactNode} [props.note] - The qualification, quieter still
 */
export function ContextRow({ children, note }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        alignItems: "baseline",
        justifyContent: "space-between",
        py: 0.75,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Typography variant="body2">{children}</Typography>
      {note ? (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * A section a reader opens when they want it, under a link or, as a `heading`, under a caption
 * with a chevron button.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.defaultOpen]
 * @param {() => void} [props.onOpen] - Called each time it is opened
 * @param {boolean} [props.heading] - Drawn as a caption with a chevron button rather than a link;
 *   its label is then a string, since the button is named from it
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  onOpen,
  heading = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () =>
    setOpen((was) => {
      if (!was) onOpen?.();
      return !was;
    });

  return (
    <Box>
      {heading ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <FigureCaption>{label}</FigureCaption>
          <ExpandToggle
            isOpen={open}
            onToggle={toggle}
            showLabel={`Show ${label}`}
            hideLabel={`Hide ${label}`}
          />
        </Box>
      ) : (
        <Box
          sx={{
            borderTop: 1,
            borderColor: "divider",
            pt: 1,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Link
            component="button"
            type="button"
            underline="hover"
            variant="body2"
            aria-expanded={open}
            onClick={toggle}
          >
            {label}
          </Link>
          <Typography component="span" variant="caption" aria-hidden="true">
            {open ? "\u25be" : "\u25b8"}
          </Typography>
        </Box>
      )}
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ pt: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

/**
 * A list showing its first rows and folding the rest behind a disclosure that counts them, folding
 * only once two or more rows would be hidden, since a fold of one is not worth a press.
 *
 * @template T
 * @param {object} props
 * @param {Array<T>} props.items
 * @param {(item: T) => React.ReactNode} props.renderItem - Carries its own key
 * @param {(folded: Array<T>) => React.ReactNode} props.foldLabel
 * @param {number} [props.shown]
 */
export function FoldedList({ items, renderItem, foldLabel, shown = 6 }) {
  const folds = items.length > shown + 1;
  const folded = folds ? items.slice(shown) : [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {(folds ? items.slice(0, shown) : items).map(renderItem)}
      {folds ? (
        <Disclosure label={foldLabel(folded)}>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {folded.map(renderItem)}
          </Box>
        </Disclosure>
      ) : null}
    </Box>
  );
}
