import { Box, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

/**
 * The colour of a spread bar's muted track, for a key drawn beside it.
 *
 * @param {object} theme
 * @returns {string}
 */
export function spreadTrackColour(theme) {
  return alpha(theme.palette.primary.main, 0.18);
}

/**
 * The key to a spread bar: what is possible, the likely span and the expected mark, then any marks
 * it is set against.
 *
 * @param {object} theme
 * @param {object} keys
 * @param {React.ReactNode} keys.possible - What the muted track is called
 * @param {React.ReactNode} keys.likely - What the likely span is called
 * @param {string} keys.colour - The likely span's colour
 * @param {Array<{id: string, label: React.ReactNode, colour: string}>} [keys.marks]
 * @returns {Array<{id: string, label: React.ReactNode, colour: string, shape?: string}>}
 */
export function spreadLegendKeys(
  theme,
  { possible, likely, colour, marks = [] },
) {
  return [
    { id: "possible", label: possible, colour: spreadTrackColour(theme) },
    { id: "likely", label: likely, colour },
    {
      id: "expected",
      label: "Expected",
      colour: theme.palette.text.primary,
      shape: "line",
    },
    ...marks.map((mark) => ({ ...mark, shape: "line" })),
  ];
}

/**
 * Where a figure that varies could land: what is possible as a muted track, the likely span solid,
 * the expected value marked, and any figure it is set against marked beside it.
 *
 * @param {object} props
 * @param {{low: number, high: number}} props.axis - The ends of the drawn scale
 * @param {{low: number, high: number}} [props.possible] - The muted track; the whole axis if absent
 * @param {{low: number, high: number}} props.likely
 * @param {number} props.expected
 * @param {Array<{id: string, value: number, colour: string, label?: React.ReactNode}>} [props.marks]
 * @param {string} props.colour - The likely span's colour
 * @param {string} props.label - What the picture shows, for a reader who cannot see it
 * @param {React.ReactNode} [props.expectedLabel] - Beneath the expected mark
 * @param {[React.ReactNode, React.ReactNode]} [props.endLabels] - Beneath the track's two ends
 * @param {boolean} [props.compact] - A thin bar for a table row
 */
export function SpreadBar({
  axis,
  possible,
  likely,
  expected,
  marks = [],
  colour,
  label,
  expectedLabel,
  endLabels,
  compact = false,
}) {
  const theme = useTheme();
  const width = axis.high - axis.low;
  const fraction = (value) =>
    width > 0 ? Math.min(1, Math.max(0, (value - axis.low) / width)) : 0;
  const at = (value) => `${fraction(value) * 100}%`;
  const span = ({ low, high }) => ({
    left: at(low),
    width: `${(fraction(high) - fraction(low)) * 100}%`,
  });
  const track = possible ?? axis;
  const labelled = marks.some((mark) => mark.label);
  const top = labelled ? 18 : 0;
  const barHeight = compact ? 8 : 14;
  const markHeight = compact ? 16 : 26;
  const bar = { position: "absolute", top: top + (markHeight - barHeight) / 2 };
  const below = top + markHeight + 2;
  const caption = { position: "absolute", top: below, whiteSpace: "nowrap" };

  return (
    <Tooltip title={label} arrow>
      <Box
        role="img"
        aria-label={label}
        sx={{
          position: "relative",
          width: "100%",
          height: below + (expectedLabel || endLabels ? 18 : 0),
        }}
      >
        <Box
          data-testid="spread-possible"
          sx={{
            ...bar,
            ...span(track),
            height: barHeight,
            borderRadius: 1,
            bgcolor: spreadTrackColour(theme),
          }}
        />
        <Box
          data-testid="spread-likely"
          sx={{
            ...bar,
            ...span(likely),
            height: barHeight,
            borderRadius: 1,
            bgcolor: colour,
          }}
        />
        <Box
          data-testid="spread-expected"
          sx={{
            position: "absolute",
            top,
            left: at(expected),
            width: 2,
            height: markHeight,
            bgcolor: "text.primary",
          }}
        />
        {marks.map((mark) => (
          <Box key={mark.id}>
            <Box
              data-testid={`spread-mark-${mark.id}`}
              sx={{
                position: "absolute",
                top: top - 4,
                left: at(mark.value),
                width: 2,
                height: markHeight + 4,
                bgcolor: mark.colour,
              }}
            />
            {mark.label ? (
              <Typography
                variant="caption"
                sx={{
                  position: "absolute",
                  top: 0,
                  left: at(mark.value),
                  transform: "translateX(-100%)",
                  pr: 0.75,
                  lineHeight: "14px",
                  whiteSpace: "nowrap",
                  color: mark.colour,
                }}
              >
                {mark.label}
              </Typography>
            ) : null}
          </Box>
        ))}
        {endLabels ? (
          <>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ ...caption, left: at(track.low) }}
            >
              {endLabels[0]}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                ...caption,
                left: at(track.high),
                transform: "translateX(-100%)",
              }}
            >
              {endLabels[1]}
            </Typography>
          </>
        ) : null}
        {expectedLabel ? (
          <Typography
            variant="caption"
            sx={{
              ...caption,
              left: at(expected),
              transform: "translateX(-50%)",
            }}
          >
            {expectedLabel}
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}
