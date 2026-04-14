import { useState } from "react";
import { Box, Divider, Typography, FormControl, Select, MenuItem, TextField, IconButton, FormHelperText, Grid } from "@mui/material";

import { systemIndexTypes, SMALL_TEXT_FORMAT, STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import VirtualisedSystemSearch from "../../../../Styled Components/autocomplete/virtualisedSystemSearch";
import GLOBAL_CONFIG from "../../../../global-config-app";
import AddIcon from "@mui/icons-material/Add";
const { DEFAULT_SYSTEM } = GLOBAL_CONFIG;
import useUsersStore from "../../../../Zustand/usersStore";
import getSystemNameFromID from "../../../../Functions/Helper/getSystemName";
import CloseIcon from "@mui/icons-material/Close";
import { formatNumberForLocale } from "../../../../Functions/Helper/numberParser";
import { saveApplicationSettings } from "../../../../Functions/Endpoints/Pirivate/userDocument";
import { useGlobalDebounce } from "../../../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../../../Context/debounceKeys";

export default function CustomSystemIndexes() {
    const [selectedSystem, setSelectedSystem] = useState(DEFAULT_SYSTEM);
    const [selectedIndexType, setSelectedIndexType] = useState("");
    const [indexValue, setIndexValue] = useState("");
    const [valueError, setValueError] = useState("");
    const { predefinedSystemIndexes } = useUsersStore((state) => state.applicationSettings);
    const { updatePredefinedSystemIndexes, deletePredefinedSystemIndexType } = useUsersStore.getState().applicationSettings.actions;

    const debouncedSaveSettings = useGlobalDebounce(
        DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
        async () => {
            await saveApplicationSettings();
        },
        2000
    );

    const handleSystemChange = (systemID) => {
        setSelectedSystem(systemID);
    };

    const handleIndexTypeChange = (event) => {
        setSelectedIndexType(event.target.value);
    };

    const handleIndexValueChange = (event) => {
        const value = event.target.value;

        // Allow empty string for clearing the field
        if (value === '') {
            setIndexValue('');
            setValueError('');
            return;
        }

        // Convert to number and validate range
        const numericValue = parseFloat(value);

        // Check for validation errors
        if (isNaN(numericValue)) {
            setValueError('Please enter a valid number');
            return;
        }

        if (numericValue < 0) {
            setValueError('Value must be at least 0');
            return;
        }

        if (numericValue > 100) {
            setValueError('Value must be no more than 100');
            return;
        }

        // Valid input
        setIndexValue(value);
        setValueError('');
    };

    const handleAddSystemIndex = async () => {

        const newIndex = {
            [selectedSystem]: {
                [selectedIndexType]: indexValue / 100,
            },
        };
        updatePredefinedSystemIndexes(newIndex);
        setSelectedIndexType("");
        setIndexValue("");
        debouncedSaveSettings();
    };

    return (
        <Box>
            <Divider sx={{ marginY: "20px" }} />
            <Box>
                <Grid container>
                    <Grid
                        sx={{ paddingX: "20px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        <Typography variant="h6" color="primary">
                            Predefined System Indexes
                        </Typography>
                    </Grid>
                    <Grid
                        sx={{ padding: "20px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                            Predefined system indexes allow you to define a default system index for a specific system and activity type. These values override the corresponding activity index provided by the ESI and are applied to all jobs assigned to the specified system.
                            <br /><br />
                            <strong>Order of assignment:</strong> Job → Predefined → ESI.
                            <br /><br />
                            Values explicitly set in job setups take the highest priority and will override predefined system indexes. If no job-level value is specified, the predefined system index will be used. If neither is defined, the ESI value will be applied.
                            <br /><br />
                            This is useful for wormhole systems, where system activity indexes are not available through the ESI.
                        </Typography>

                    </Grid>
                </Grid>
                <Grid container>
                    <Grid
                        align="center"
                        sx={{ paddingX: "20px" }}
                        size={{
                            xs: 12,
                            sm: 4
                        }}>
                        <VirtualisedSystemSearch
                            selectedValue={selectedSystem}
                            updateSelectedValue={handleSystemChange}
                        />
                    </Grid>
                    <Grid
                        align="center"
                        sx={{ paddingX: "20px" }}
                        size={{
                            xs: 12,
                            sm: 3
                        }}>
                        <FormControl fullWidth>
                            <Select
                                value={selectedIndexType}
                                onChange={handleIndexTypeChange}
                                variant="standard"
                                disabled={!selectedSystem}
                            >
                                {Object.entries(systemIndexTypes).map(([key, type]) => (
                                    <MenuItem key={key} value={key}>
                                        {type.label}
                                    </MenuItem>
                                ))}
                            </Select>
                            <FormHelperText variant="standard">Activity Type</FormHelperText>
                        </FormControl>
                    </Grid>
                    <Grid
                        align="center"
                        sx={{ paddingX: "20px" }}
                        size={{
                            xs: 12,
                            sm: 3
                        }}>
                        <TextField
                            fullWidth
                            value={indexValue}
                            variant="standard"
                            disabled={!selectedSystem || !selectedIndexType}
                            onChange={handleIndexValueChange}
                            helperText={valueError || "System Index Value (0-100)"}
                            error={!!valueError}
                            type="number"
                            slotProps={{
                                htmlInput: {
                                    step: "0.01",
                                    min: "0",
                                    max: "100",
                                }
                            }}
                        />
                    </Grid>
                    <Grid
                        align="center"
                        sx={{ paddingX: "20px" }}
                        size={{
                            xs: 12,
                            sm: 2
                        }}>
                        <IconButton
                            size="small"
                            color="primary"
                            onClick={handleAddSystemIndex}
                            disabled={!selectedSystem || !selectedIndexType || !indexValue || !!valueError}
                        >
                            <AddIcon />
                        </IconButton>
                    </Grid>
                    <Grid
                        align="center"
                        sx={{ padding: "20px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        {Object.entries(predefinedSystemIndexes).map(([systemID, indexData]) => {
                            const systemName = getSystemNameFromID(Number(systemID))
                            return (
                                <Box key={systemID} sx={{ display: "flex", flexDirection: "row", gap: "10px", alignItems: "center", marginBottom: "8px" }}>
                                    <Typography sx={{ typography: STANDARD_TEXT_FORMAT, fontWeight: "bold" }}>
                                        {systemName}:
                                    </Typography>
                                    <Box sx={{ display: "flex", flexDirection: "row", gap: "15px", flexWrap: "wrap" }}>
                                        {Object.entries(indexData).map(([indexType, indexValue]) => (
                                            <Box key={indexType} sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                <Typography sx={{ typography: SMALL_TEXT_FORMAT }}>
                                                    {systemIndexTypes[indexType]?.label || indexType}: {formatNumberForLocale(indexValue * 100, { min: 0, max: 2 })}%
                                                </Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={async () => {
                                                        deletePredefinedSystemIndexType(Number(systemID), indexType);
                                                        debouncedSaveSettings();
                                                    }}
                                                    sx={{ padding: "2px" }}
                                                >
                                                    <CloseIcon fontSize="small" color="error" />
                                                </IconButton>
                                            </Box>
                                        ))}
                                    </Box>
                                </Box>
                            )
                        })}
                    </Grid>
                </Grid>
            </Box>
        </Box>
    );
}