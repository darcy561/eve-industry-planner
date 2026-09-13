import { FormControlLabel, Switch } from "@mui/material";

/**
 * A setting that is on or off, named on the left with the switch on the right.
 *
 * @param {object} props
 * @param {React.ReactNode} props.label
 * @param {boolean} props.checked
 * @param {(checked: boolean) => void} props.onChange - receives the new state
 * @param {boolean} [props.disabled]
 */
export function SwitchField({ label, checked, onChange, disabled = false }) {
  return (
    <FormControlLabel
      label={label}
      labelPlacement="start"
      disabled={disabled}
      sx={{ width: "100%", ml: 0, justifyContent: "space-between", gap: 1 }}
      control={
        <Switch
          checked={checked}
          onChange={(event) => onChange?.(event.target.checked)}
        />
      }
    />
  );
}
