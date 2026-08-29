import { FormControl, Select, MenuItem, FormHelperText } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import { useMemo } from "react";

export default function CorporationHangarsSelect({ selectedCorporation, value, onChange }) {
    const corporations = useUsersStore(
        (state) => state.account.corporations
    );

    // Get hangars for the selected corporation with safety checks
    const hangars = useMemo(() => {
        const corp = corporations.find(
            (c) => Number(c.corporation_id) === Number(selectedCorporation)
        );
        if (!selectedCorporation || !corp) {
            return [];
        }
        return corp.hangars || [];
    }, [selectedCorporation, corporations]);

    // Ensure the selected value is valid (exists in hangars) or default to empty string
    const selectedValue = useMemo(() => {
        if (!value) return "";
        // Check if the value exists in the hangars (by assetLocationRef)
        const hangarExists = hangars.some(
            (hangar) => hangar.assetLocationRef === value
        );
        if (hangarExists) {
            return value;
        }
        // Value doesn't match any hangar, return empty string to avoid out of range error
        return "";
    }, [value, hangars]);

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
                id="corporation-hangars-select"
                aria-describedby="corporation-hangars-helper"
                variant="standard"
                size="small"
                value={selectedValue}
                displayEmpty
                renderValue={(selected) => {
                    if (!selected) {
                        return <em>Select a hangar</em>;
                    }
                    const selectedHangar = hangars.find(
                        (hangar) => hangar.assetLocationRef === selected
                    );
                    return selectedHangar ? selectedHangar.name : "";
                }}
                onChange={(e) => {
                    if (onChange) {
                        onChange(e.target.value);
                    } else {
                        console.error("Corporation Hangars Select is missing an onChange Function");
                    }
                }}
            >
                <MenuItem value="" disabled>
                    <em>Select a hangar</em>
                </MenuItem>
                {hangars.map((hangar) => (
                    <MenuItem key={hangar.assetLocationRef} value={hangar.assetLocationRef}>
                        {hangar.name}
                    </MenuItem>
                ))}
            </Select>
            <FormHelperText id="corporation-hangars-helper" variant="standard">Corporation Hangars</FormHelperText>
        </FormControl>
    );
}

