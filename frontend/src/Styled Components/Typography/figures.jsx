import { useState } from "react";
import { Box, Collapse, Link, Skeleton, Typography } from "@mui/material";

import {
  formatNumberForLocale,
  formatPercentage,
} from "../../Functions/Helper/numberParser";

/**
 * The figure atoms of the app-shell design.
 *
 * Every panel showing numbers repeats the same three decisions — line the digits
 * up, say something when there is no figure, and colour a comparison by its
 * direction. They live here so a panel states a figure rather than styling one.
 */

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
 * The theme colour a tone resolves to, for the places a tone has to reach
 * something that is not a Figure — an icon beside one, a border, a chart series.
 *
 * @param {string} tone - One of FIGURE_TONE
 * @returns {string} A theme palette path
 */
export function figureToneColour(tone) {
  return TONE_COLOUR[tone] ?? TONE_COLOUR[FIGURE_TONE.PLAIN];
}

/**
 * A number, lined up with the numbers above and below it.
 *
 * Renders an em dash for a value the app does not have, so a column reads as
 * "nothing to say here" rather than as a zero or a gap.
 *
 * A raw number is put through the locale formatter rather than trusted to have
 * been formatted already: `String(n)` loses the separators, and loses them in a
 * way only a reader outside en-GB would notice. `formatOptions` says how many
 * places it wants — a count asks for `{ max: 0 }` — since ISK's two are the
 * formatter's default rather than the right answer for every figure.
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
 * A change, as a percentage, coloured by which way it went.
 *
 * Takes a fraction rather than a percentage because that is what a ratio of two
 * figures gives, and converting at each call site is where a factor of a hundred
 * goes missing.
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
 * How a row that closes a block is drawn: ruled above rather than below, so it
 * reads as the sum of what is over it rather than the start of what is under it.
 *
 * Shared because it is a decision about what a total looks like, and a table
 * cell and a flex row were each making it separately.
 *
 * @type {object}
 */
export const totalRowSx = {
  borderTop: 1,
  borderColor: "divider",
  fontWeight: 500,
};

/**
 * Names a group of rows beneath it.
 *
 * Kept free of any table so a panel laying rows out in a stack can use the same
 * caption a table's band row does.
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
 * A label and its figure, on one line.
 *
 * The shape every cost and return breakdown is made of. A row can carry a
 * sub-label under its name, and the closing row of a block is marked as a total
 * rather than being styled by whoever draws it last.
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
 * A quiet line under a panel, stating what it holds on the left and a total on
 * the right.
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
 * Cost Breakdown opens with a cost per unit and Returns with a net return, both
 * this shape — so the panel names its headline rather than laying one out.
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
 * Cost Breakdown puts a range of previous builds next to its cost per unit;
 * Returns puts three normalisations next to its net. Same arrangement, so the
 * panels state their parts rather than each laying out a header.
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
        // Grows into whatever the headline leaves, so an aside that wants the
        // width — a range bar, which is unreadable narrow — can take it, while
        // one made of fixed tiles stays against the right edge as before.
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
 * A measure on its own card: what it is, what it is now, how that compares, and
 * what it was before.
 *
 * The shape the archive statistics already use and the returns header repeats.
 * A tile states its parts and lets this decide the sizes, the tones and where
 * the comparison sits, so two tiles beside each other cannot disagree.
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
 * A relationship between two figures, stated and left there.
 *
 * Returns uses these for break-even and the range of previous builds. They read
 * as context rather than as a result, which is why they are quiet and carry no
 * colour of their own.
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
 * A section a reader opens when they want the working.
 *
 * The ledger behind Returns and the cost-over-time chart behind Cost Breakdown
 * are both things a panel should not lead with but must be able to show.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.defaultOpen]
 * @param {() => void} [props.onOpen] - Called the first time it is opened, for a
 *   section whose contents are expensive enough to be fetched on demand
 */
export function Disclosure({ label, children, defaultOpen = false, onOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box>
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
          onClick={() =>
            setOpen((was) => {
              // Fires on the way open only: a section fetched on demand should
              // not re-fetch every time it is folded away and back.
              if (!was) onOpen?.();
              return !was;
            })
          }
        >
          {label}
        </Link>
        <Typography component="span" variant="caption" aria-hidden="true">
          {open ? "\u25be" : "\u25b8"}
        </Typography>
      </Box>
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
