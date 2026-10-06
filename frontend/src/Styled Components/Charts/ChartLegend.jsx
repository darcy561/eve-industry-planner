import { Box, Typography } from "@mui/material";
import { rangeMarkSx } from "./bars/RangeBar";

/**
 * A chart's key as plain text: a swatch and a label for each thing drawn, a block for an area and a
 * thin upright for a line or mark.
 *
 * @param {object} props
 * @param {Array<{id: string, label: React.ReactNode, colour: string, shape?: "block"|"line"}>} props.keys
 * @param {object} [props.sx]
 */
export function ChartLegend({ keys = [], sx }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, ...sx }}>
      {keys.map((key) => (
        <Box
          key={key.id}
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}
        >
          <Box
            aria-hidden
            data-testid={`legend-${key.id}`}
            sx={
              key.shape === "line"
                ? { ...rangeMarkSx("average"), bgcolor: key.colour }
                : {
                    width: 9,
                    height: 9,
                    borderRadius: "2px",
                    bgcolor: key.colour,
                    flexShrink: 0,
                  }
            }
          />
          <Typography variant="caption" color="text.secondary">
            {key.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
