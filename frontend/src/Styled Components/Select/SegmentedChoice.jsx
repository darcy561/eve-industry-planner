import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";

/**
 * One of a few options as a row of joined buttons, each optionally explained by a tooltip; pressing
 * the chosen one again keeps it chosen, since one is always in force.
 *
 * @param {object} props
 * @param {Array<{value: string, label: React.ReactNode, tooltip?: React.ReactNode}>} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange - receives the newly chosen value
 * @param {string} [props.label] - names the group for a screen reader
 * @param {string} [props.labelledBy] - the id of a visible label naming the group instead
 * @param {boolean} [props.stretch] - share the width between the buttons
 * @param {boolean} [props.disabled]
 * @param {object} [props.sx]
 */
export function SegmentedChoice({
  options,
  value,
  onChange,
  label,
  labelledBy,
  stretch = false,
  disabled = false,
  sx,
}) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      disabled={disabled}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onChange={(_event, next) => {
        if (next !== null) onChange(next);
      }}
      sx={sx}
    >
      {options.map((option) => {
        const button = (
          <ToggleButton
            key={option.value}
            value={option.value}
            sx={{ textTransform: "none", px: 2, ...(stretch && { flex: 1 }) }}
          >
            {option.label}
          </ToggleButton>
        );
        return option.tooltip ? (
          <Tooltip
            key={option.value}
            title={option.tooltip}
            arrow
            describeChild
          >
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </ToggleButtonGroup>
  );
}
