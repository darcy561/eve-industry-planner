import { Checkbox, FormControlLabel } from "@mui/material";

/**
 * Whether a setup is costed against the system index the reader types rather than the one the
 * server reports.
 *
 * @param {Object} props
 * @param {boolean} props.initialState - Whether the reader's own index is in use
 * @param {(checked: boolean) => void} props.onChange
 */
export default function UseAlternativeCheckbox({ initialState, onChange }) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={initialState}
          onChange={(e) => onChange(e.target.checked)}
          size="small"
          sx={{
            color: (theme) => theme.palette.secondary.main,
            "&.Mui-checked": {
              color: (theme) => theme.palette.secondary.main,
            },
          }}
        />
      }
      label="Use my own system index"
      labelPlacement="bottom"
      sx={{
        "& .MuiFormControlLabel-label": {
          fontSize: "0.75rem",
          lineHeight: 1.2,
        },
        flexDirection: "column",
        alignItems: "center",
        margin: 0,
      }}
    />
  );
}
