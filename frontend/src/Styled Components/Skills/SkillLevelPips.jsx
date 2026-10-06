import { Box, Tooltip } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { maxSkillLevel } from "../../Context/defaultValues";

const LEVELS = Array.from({ length: maxSkillLevel }, (_, index) => index + 1);

/**
 * A skill's level as one mark per level, which is also the control: clicking a mark asks what that
 * level would be worth, and clicking the trained level puts the question back.
 *
 * @param {object} props
 * @param {number|null} props.level - The character's own level, null signed out
 * @param {number|null} [props.required] - What the blueprint asks for
 * @param {number|null} [props.proposed] - A level being tried
 * @param {(level: number|null) => void} [props.onPropose] - Omit to render marks
 *   that are not a control
 * @param {string} props.name - The skill, for the control's label
 */
export default function SkillLevelPips({
  level,
  required = null,
  proposed = null,
  onPropose,
  name,
}) {
  const trained = level ?? 0;
  const at = proposed ?? trained;

  const fillOf = (mark) => {
    if (mark <= at && mark <= trained) return "trained";
    if (mark <= at) return "proposed";
    if (mark <= trained) return "surrendered";
    if (required !== null && mark <= required) return "short";
    return "empty";
  };

  const colourOf = (fill) =>
    ({
      trained: "success.main",
      proposed: "primary.main",
      surrendered: (theme) => alpha(theme.palette.success.main, 0.25),
      short: (theme) => theme.palette.error.light,
      empty: "divider",
    })[fill];

  return (
    <Box sx={{ display: "inline-flex", gap: "2px", flexShrink: 0 }}>
      {LEVELS.map((mark) => {
        const fill = fillOf(mark);
        const pip = (
          <Box
            key={mark}
            component={onPropose ? "button" : "span"}
            type={onPropose ? "button" : undefined}
            aria-label={onPropose ? `${name} at level ${mark}` : undefined}
            data-fill={fill}
            onClick={
              onPropose
                ? (event) => {
                    event.stopPropagation();
                    onPropose(mark === at ? null : mark);
                  }
                : undefined
            }
            sx={{
              width: 7,
              height: 12,
              p: 0,
              border: 0,
              borderRadius: "1px",
              display: "block",
              bgcolor: colourOf(fill),
              cursor: onPropose ? "pointer" : "default",
            }}
          />
        );

        return onPropose ? (
          <Tooltip key={mark} title={`Try level ${mark}`} arrow>
            {pip}
          </Tooltip>
        ) : (
          pip
        );
      })}
    </Box>
  );
}
