import { FormControl, Select, MenuItem, FormHelperText } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import { useMemo } from "react";
import { isNoAccessLocation } from "../../Functions/Assets/assetLocationConstants";

export default function CorporationOfficesSelect({ selectedCorporation, value, onChange }) {
    const corporations = useUsersStore(
        (state) => state.account.corporations
    );
    
    // Subscribe to worldData changes so component re-renders when location names are added
    const universeIDs = useUsersStore(
        (state) => state.worldData.universeIDs
    );

    // Get office locations for the selected corporation with safety checks
    const officeLocations = useMemo(() => {
        const corp = corporations.find(
            (c) => Number(c.corporation_id) === Number(selectedCorporation)
        );
        if (!selectedCorporation || !corp) {
            return [];
        }
        return corp.officeLocations || [];
    }, [selectedCorporation, corporations]);

    // Ensure the selected value is valid (exists in officeLocations) or default to empty string
    const selectedValue = useMemo(() => {
        if (!value) return "";
        // Check if the value exists in the office locations
        if (officeLocations.includes(value)) {
            return value;
        }
        // Value doesn't match any office location, return empty string to avoid out of range error
        return "";
    }, [value, officeLocations]);

    // Sort office locations alphabetically by name
    const sortedOfficeLocations = useMemo(() => {
        const worldData = useUsersStore.getState().worldData;
        return officeLocations
            .map((locationID) => {
                const locationNameData = worldData.actions.findUniverseData(locationID);
                if (
                    !locationNameData ||
                    isNoAccessLocation(locationNameData)
                ) {
                    return null;
                }
                return {
                    locationID,
                    name: locationNameData.name,
                };
            })
            .filter((item) => item !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [officeLocations, universeIDs]);

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
                    const selectedLocation = sortedOfficeLocations.find(
                        (loc) => loc.locationID === selected
                    );
                    return selectedLocation ? selectedLocation.name : "";
                }}
                onChange={(e) => {
                    if (onChange) {
                        onChange(e.target.value);
                    } else {
                        console.error("Corporation Offices Select is missing an onChange Function");
                    }
                }}
            >
                <MenuItem value="" disabled>
                    <em>Select an office</em>
                </MenuItem>
                {sortedOfficeLocations.map(({ locationID, name }) => (
                    <MenuItem key={locationID} value={locationID}>
                        {name}
                    </MenuItem>
                ))}
            </Select>
            <FormHelperText id="corporation-offices-helper" variant="standard">Corporation Offices</FormHelperText>
        </FormControl>
    );
}