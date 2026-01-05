import { useState, useMemo, useEffect } from "react";
import { Box, Typography, FormGroup, FormControlLabel, Checkbox, Grid, IconButton, Tooltip } from "@mui/material";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import useUsersStore from "../../../Zustand/usersStore";

/**
 * Character selection component for the scheduler.
 * Allows users to select which characters to include in the schedule.
 * 
 * @param {Object} props
 * @param {Function} props.onSelectionChange - Callback when selection changes, receives array of selected User objects
 * @returns {JSX.Element}
 */
export default function CharacterSelection({ 
    onSelectionChange 
}) {
    const allUsers = useUsersStore((state) => state.users.userArray);
    
    // Initialize selected characters - default to all if available
    const [selectedCharacters, setSelectedCharacters] = useState(() => {
        // Default to all characters if available, otherwise empty set
        if (allUsers && allUsers.length > 0) {
            return new Set(allUsers.map(user => user.CharacterHash));
        }
        return new Set();
    });

    // Update selected characters when allUsers becomes available (if not already set)
    useEffect(() => {
        if (allUsers && allUsers.length > 0 && selectedCharacters.size === 0) {
            setSelectedCharacters(new Set(allUsers.map(user => user.CharacterHash)));
        }
    }, [allUsers]);

    // Filter users based on selected characters and notify parent
    const selectedUsers = useMemo(() => {
        if (!allUsers || allUsers.length === 0) return [];
        return allUsers.filter(user => selectedCharacters.has(user.CharacterHash));
    }, [allUsers, selectedCharacters]);

    // Notify parent when selection changes
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedUsers);
        }
    }, [selectedUsers, onSelectionChange]);

    const handleCharacterToggle = (characterHash) => {
        setSelectedCharacters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(characterHash)) {
                newSet.delete(characterHash);
            } else {
                newSet.add(characterHash);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (allUsers && allUsers.length > 0) {
            setSelectedCharacters(new Set(allUsers.map(user => user.CharacterHash)));
        }
    };

    const handleDeselectAll = () => {
        setSelectedCharacters(new Set());
    };

    // Calculate number of columns based on number of characters
    // Aim for roughly 3-4 items per column to keep it compact and prevent long scrolling
    const columns = useMemo(() => {
        if (!allUsers || allUsers.length === 0) return 1;
        const itemCount = allUsers.length;
        
        // For small numbers, use 2 columns to distribute items
        if (itemCount <= 4) {
            return 2; // 2 columns for 1-4 items (distributes evenly)
        } else if (itemCount <= 8) {
            return 3; // 3 columns for 5-8 items
        } else if (itemCount <= 12) {
            return 4; // 4 columns for 9-12 items
        } else {
            // For larger numbers, calculate based on items per column
            const itemsPerColumn = 4;
            const calculatedColumns = Math.ceil(itemCount / itemsPerColumn);
            return Math.min(calculatedColumns, 6); // Max 6 columns
        }
    }, [allUsers]);

    // Calculate grid item size based on number of columns
    // MUI Grid uses 12 columns, so we divide 12 by our column count
    const gridItemSize = useMemo(() => {
        return Math.floor(12 / columns);
    }, [columns]);

    return (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: "divider" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="subtitle2">
                    Select Characters to Include
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Select All" arrow>
                        <IconButton size="small" onClick={handleSelectAll}>
                            <SelectAllIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Deselect All" arrow>
                        <IconButton size="small" onClick={handleDeselectAll}>
                            <DeselectIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            <Box sx={{ p: 2, maxHeight: 200, overflow: "auto" }}>
                <FormGroup>
                    <Grid container spacing={1}>
                        {allUsers.map((user) => (
                            <Grid item xs={gridItemSize} key={user.CharacterHash}>
                                <FormControlLabel
                                    control={   
                                        <Checkbox
                                            checked={selectedCharacters.has(user.CharacterHash)}
                                            onChange={() => handleCharacterToggle(user.CharacterHash)}
                                            size="small"
                                        />
                                    }
                                    label={user.CharacterName || `Character ${user.CharacterID}`}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </FormGroup>
            </Box>
        </Box>
    );
}

