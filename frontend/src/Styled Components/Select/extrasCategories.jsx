import { Select, MenuItem, FormControl, FormHelperText } from "@mui/material";
import { usePlannerExtrasCategories } from "../../Hooks/React Query/plannerSettings.js";

/**
 * Chooses the category a cost is filed under, from those the active planner
 * offers.
 *
 * @param {Object} props - Component props
 * @param {string} props.value - Currently selected category ID
 * @param {Function} props.onChange - Callback function called when selection changes. Receives the category ID.
 * @returns {JSX.Element} Extras categories select component
 */
export default function ExtrasCategoriesSelect({ value, onChange }) {
  const { categories } = usePlannerExtrasCategories();
  return (
    <FormControl
      sx={{
        "& .MuiFormHelperText-root": {
          color: (theme) => theme.palette.secondary.main,
        },
      }}
      fullWidth
    >
      <Select
        id="extras-categories-select"
        aria-describedby="extras-categories-helper"
        variant="standard"
        size="small"
        value={value}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Extras Categories Select is missing an onChange Function",
            );
          }
        }}
      >
        {categories.map((entry) => {
          if (entry?.deleted) return null;
          return (
            <MenuItem key={entry.id} value={entry.id}>
              {entry.label}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText id="extras-categories-helper" variant="standard">
        Extras Categories
      </FormHelperText>
    </FormControl>
  );
}
