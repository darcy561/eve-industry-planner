import { Checkbox, FormControlLabel } from "@mui/material";

/**
 * A checkbox component for enabling/disabling alternative system index values.
 * Used in EVE Online industry planning to override default system index calculations.
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.initialState - Initial checked state of the checkbox
 * @param {Function} props.onChange - Callback function called when checkbox state changes. Receives the new boolean value.
 * @returns {JSX.Element} Alternative system index checkbox component
 * 
 * @example
 * <UseAlternativeCheckbox 
 *   initialState={false}
 *   onChange={(checked) => console.log('Use alternative:', checked)}
 * />
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
             />}
            label="Use Alternative System Index Value"
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
    )
}