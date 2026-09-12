import { FormControl, Select, MenuItem, FormHelperText } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import { useMemo } from "react";
import useLocationNames from "../../Hooks/EveEsi/useLocationNames";
import { locationOptions } from "../../Functions/Assets/assetTree";

export default function CorporationOfficesSelect({
  selectedCorporation,
  value,
  onChange,
}) {
  const corporations = useUsersStore((state) => state.account.corporations);

  const officeLocations = useMemo(() => {
    const corp = corporations.find(
      (c) => Number(c.corporation_id) === Number(selectedCorporation),
    );
    if (!selectedCorporation || !corp) {
      return [];
    }
    return corp.officeLocations || [];
  }, [selectedCorporation, corporations]);

  const { names, failed } = useLocationNames(officeLocations);

  // An office nobody can dock at is offered carrying the name that says so, rather than left out:
  // the corporation has it either way, and hiding it reads as the office not existing. One whose
  // lookup did not settle is offered for the same reason, and because a chosen office dropping out
  // of this list clears the reader's choice without saying why.
  const offices = useMemo(
    () => locationOptions(officeLocations, names, failed),
    [officeLocations, names, failed],
  );

  // Against the offices actually offered, not the corporation's whole list: an office whose name is
  // still being asked about has no item to select, and a value with no item is out of range.
  const selectedValue = useMemo(() => {
    if (!value) return "";
    return offices.some((office) => office.locationId === value) ? value : "";
  }, [value, offices]);

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
        id="corporation-offices-select"
        aria-describedby="corporation-offices-helper"
        variant="standard"
        size="small"
        value={selectedValue}
        displayEmpty
        renderValue={(selected) => {
          if (!selected) {
            return <em>Select an office</em>;
          }
          const office = offices.find((loc) => loc.locationId === selected);
          return office?.name || "";
        }}
        onChange={(e) => {
          if (onChange) {
            onChange(e.target.value);
          } else {
            console.error(
              "Corporation Offices Select is missing an onChange Function",
            );
          }
        }}
      >
        <MenuItem value="" disabled>
          <em>Select an office</em>
        </MenuItem>
        {offices.map(({ locationId, name }) => (
          <MenuItem key={locationId} value={locationId}>
            {name}
          </MenuItem>
        ))}
      </Select>
      <FormHelperText id="corporation-offices-helper" variant="standard">
        Corporation Offices
      </FormHelperText>
    </FormControl>
  );
}
