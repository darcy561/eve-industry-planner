import { Box, Typography } from "@mui/material";

import SkillLevelPips from "./SkillLevelPips";
import { FIGURE_TONE, Figure } from "../Typography/figures";

/**
 * One skill as a row: its name and what it does here, then its level as pips — which try another
 * level when given `onPropose` — and that level as a figure.
 *
 * @param {object} props
 * @param {string} props.name
 * @param {React.ReactNode} [props.caption] - What the skill does here, beneath its name
 * @param {number|null} props.level - The character's own level, null when unknown
 * @param {number|null} [props.required] - What the work asks for
 * @param {number|null} [props.proposed] - A level being tried
 * @param {(level: number|null) => void} [props.onPropose] - Receives a level to try, or null to stop
 * @param {React.ReactNode} props.value - The level as text, already formatted
 * @param {string} [props.tone] - One of FIGURE_TONE, for the value
 * @param {object} [props.sx] - The row's own surface, such as a state stripe
 */
export function SkillLevelRow({
  name,
  caption,
  level,
  required = null,
  proposed = null,
  onPropose,
  value,
  tone = FIGURE_TONE.PLAIN,
  sx,
}) {
  return (
    <Box
      sx={[
        {
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 2,
          py: 0.5,
          borderBottom: 1,
          borderColor: "divider",
          "&:last-of-type": { borderBottom: 0 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{name}</Typography>
        {caption ? (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
      >
        <SkillLevelPips
          level={level}
          required={required}
          proposed={proposed}
          name={name}
          onPropose={onPropose}
        />
        <Figure tone={tone} sx={{ minWidth: 44, textAlign: "right" }}>
          {value}
        </Figure>
      </Box>
    </Box>
  );
}
