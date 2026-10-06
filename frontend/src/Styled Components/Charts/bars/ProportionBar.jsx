import { Box, Tooltip, useTheme } from "@mui/material";

import { resolveSeriesColour } from "../chartTheme";
import { ChartLegend } from "../ChartLegend";

/**
 * What a total is made of, as one bar with no figures of its own, each part coloured as a chart
 * series of the same meaning.
 *
 * @param {object} props
 * @param {Array<{id: string, label: React.ReactNode, value: number, role?: string, colour?: string}>} props.parts
 * @param {(part: object) => React.ReactNode} [props.describe] - What a part's tooltip says
 * @param {boolean} [props.showLegend]
 * @param {number} [props.height]
 * @param {string|null} [props.activeId] - The part being looked at, dimming the
 *   rest so the eye can carry it to whatever states the same part in words
 * @param {(id: string|null) => void} [props.onActivePart] - Supplied by a
 *   consumer that has somewhere to carry it to; without it the bar is inert
 */
export function ProportionBar({
  parts = [],
  describe,
  showLegend = false,
  height = 26,
  activeId = null,
  onActivePart,
}) {
  const theme = useTheme();
  const present = parts.filter((part) => Number(part.value) > 0);
  const total = present.reduce((sum, part) => sum + Number(part.value), 0);

  if (total <= 0) return null;

  const colourOf = (part, index) => resolveSeriesColour(theme, part, index);

  const interactive = Boolean(onActivePart);
  const activate = (id) => () => onActivePart?.(id);

  return (
    <Box>
      <Box
        sx={{ display: "flex", height, borderRadius: 1, overflow: "hidden" }}
      >
        {present.map((part, index) => (
          <Tooltip
            key={part.id}
            title={describe ? describe(part) : part.label}
            arrow
          >
            <Box
              data-testid={`proportion-${part.id}`}
              data-active={activeId === part.id ? "true" : undefined}
              tabIndex={interactive ? 0 : undefined}
              onMouseEnter={activate(part.id)}
              onMouseLeave={activate(null)}
              onFocus={activate(part.id)}
              onBlur={activate(null)}
              sx={{
                width: `${(part.value / total) * 100}%`,
                bgcolor: colourOf(part, index),
                cursor: interactive ? "default" : undefined,
                opacity: activeId && activeId !== part.id ? 0.35 : 1,
                transition: theme.transitions.create("opacity", {
                  duration: theme.transitions.duration.shortest,
                }),
              }}
            />
          </Tooltip>
        ))}
      </Box>
      {showLegend ? (
        <ChartLegend
          sx={{ mt: 1 }}
          keys={present.map((part, index) => ({
            id: part.id,
            label: part.label,
            colour: colourOf(part, index),
          }))}
        />
      ) : null}
    </Box>
  );
}
