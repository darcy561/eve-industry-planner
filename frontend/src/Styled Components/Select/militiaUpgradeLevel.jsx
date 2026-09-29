import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";

const LEVELS = [0, 1, 2, 3, 4, 5];

/**
 * A select for how far the holding faction has upgraded a setup's system, which
 * nothing publishes and a reader states.
 *
 * @param {Object} props - Component props
 * @param {number} [props.value=0] - The level currently chosen
 * @param {Function} props.onChange - Called with the chosen level
 * @returns {JSX.Element}
 */
function MilitiaUpgradeLevelSelect({ value = 0, onChange }) {
  return (
    <FormControl fullWidth>
      <Select
        id="militia-upgrade-level-select"
        aria-label="System Upgrade Level"
        aria-describedby="militia-upgrade-level-helper"
        variant="standard"
        size="small"
        value={LEVELS.includes(value) ? value : 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {LEVELS.map((level) => (
          <MenuItem key={level} value={level}>
            {level === 0 ? "Not upgraded" : `Level ${level}`}
          </MenuItem>
        ))}
      </Select>
      <FormHelperText id="militia-upgrade-level-helper" variant="standard">
        System Upgrade Level
      </FormHelperText>
    </FormControl>
  );
}

export default MilitiaUpgradeLevelSelect;
