import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";

/**
 * A select component for choosing skill levels (0-5).
 * Displays skill level options from 0 to 5 with error handling.
 * 
 * @param {Object} props - Component props
 * @param {number} [props.level=0] - Currently selected skill level
 * @param {string} [props.skillName=""] - Name of the skill for labeling
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the skill level number.
 * @param {Object} [props.error] - Error state object with isError boolean and errorText string
 * @returns {JSX.Element} Skill selector component
 * 
 * @example
 * <SkillSelecter 
 *   level={3}
 *   skillName="Industry"
 *   onChange={(level) => setSkillLevel(level)}
 *   error={{ isError: false, errorText: "" }}
 * />
 */
function SkillSelecter({
  level = 0,
  skillName = "",
  onChange,
  error = { isError: false, errorText: "" },
}) {
  return (
    <FormControl
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },
        "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
          {
            display: "none",
          },
      }}
      error={error.isError}
      fullWidth
    >
      <Select
        id={`skill-level-select-${skillName}`}
        aria-describedby={`skill-level-helper-${skillName}`}
        variant="standard"
        size="small"
        value={level}
        error={error.isError}
        onChange={(e) => {
          if (onChange) {
            onChange(Number(e.target.value));
          } else {
            console.error("Skill Name Select is missing an onChange Function");
          }
        }}
        sx={{
          color: error.isError ? "error.main" : "inherit",
          "& .MuiSelect-icon": {
            color: error.isError ? "error.main" : "inherit",
          },
        }}
      >
        {[...Array(6).keys()].map((entry) => {
          return (
            <MenuItem key={entry} value={entry}>
              {entry}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText
        id={`skill-level-helper-${skillName}`}
        variant="standard"
        sx={{
          color: error.isError ? "error.main" : "secondary.main",
        }}
      >
        {error.isError ? error.errorText : skillName}
      </FormHelperText>
    </FormControl>
  );
}

export default SkillSelecter;
