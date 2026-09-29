import { FormControl, FormHelperText, MenuItem, Select } from "@mui/material";

import useLocationNames from "../../Hooks/EveEsi/useLocationNames";

/**
 * A select for the militia a setup is costed against, offering the militias that
 * would change what it costs.
 *
 * @param {Object} props - Component props
 * @param {number|null} [props.value] - The militia currently chosen
 * @param {Array<number>} [props.options] - The faction ids worth offering, memoised
 * @param {Function} props.onChange - Called with the chosen faction id, or null
 * @returns {JSX.Element}
 */
function EnlistedMilitiaSelect({ value = null, options = [], onChange }) {
  const { names } = useLocationNames(options);

  return (
    <FormControl fullWidth>
      <Select
        id="enlisted-militia-select"
        aria-label="Enlisted Militia"
        aria-describedby="enlisted-militia-helper"
        variant="standard"
        size="small"
        value={options.includes(value) ? value : 0}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <MenuItem value={0}>Not enlisted</MenuItem>
        {options.map((factionID) => (
          <MenuItem key={factionID} value={factionID}>
            {names[factionID]?.name ?? `Faction ${factionID}`}
          </MenuItem>
        ))}
      </Select>
      <FormHelperText id="enlisted-militia-helper" variant="standard">
        Enlisted Militia
      </FormHelperText>
    </FormControl>
  );
}

export default EnlistedMilitiaSelect;
