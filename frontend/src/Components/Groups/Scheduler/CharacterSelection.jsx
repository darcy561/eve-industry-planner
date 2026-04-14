import { useState, useMemo, useEffect } from "react";
import { Box, Typography, FormGroup, FormControlLabel, Checkbox, Grid, IconButton, Tooltip } from "@mui/material";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import useUsersStore from "../../../Zustand/usersStore";
import { shallow } from "zustand/shallow";

/**
 * Character selection component for the scheduler.
 * Choose which `account.characters` rows to include in the schedule.
 *
 * @param {Object} props
 * @param {Function} props.onSelectionChange - Receives an array of selected character rows (`Character` instances)
 * @returns {JSX.Element}
 */
export default function CharacterSelection({ 
    onSelectionChange 
}) {
    const allCharacters = useUsersStore(
      (state) => Object.values(state.account.characters),
      shallow
    );
    
    // Initialize selected characters - default to all if available
    const [selectedCharacterHashes, setSelectedCharacterHashes] = useState(() => {
        if (allCharacters && allCharacters.length > 0) {
            return new Set(allCharacters.map((character) => character.CharacterHash));
        }
        return new Set();
    });

    useEffect(() => {
        if (allCharacters && allCharacters.length > 0 && selectedCharacterHashes.size === 0) {
            setSelectedCharacterHashes(new Set(allCharacters.map((character) => character.CharacterHash)));
        }
    }, [allCharacters]);

    const selectedCharacterRows = useMemo(() => {
        if (!allCharacters || allCharacters.length === 0) return [];
        return allCharacters.filter((character) =>
          selectedCharacterHashes.has(character.CharacterHash)
        );
    }, [allCharacters, selectedCharacterHashes]);

    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedCharacterRows);
        }
    }, [selectedCharacterRows, onSelectionChange]);

    const handleCharacterToggle = (characterHash) => {
        setSelectedCharacterHashes((prev) => {
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
        if (allCharacters && allCharacters.length > 0) {
            setSelectedCharacterHashes(
              new Set(allCharacters.map((character) => character.CharacterHash))
            );
        }
    };

    const handleDeselectAll = () => {
        setSelectedCharacterHashes(new Set());
    };

    // Calculate number of columns based on number of characters
    // Aim for roughly 3-4 items per column to keep it compact and prevent long scrolling
    const columns = useMemo(() => {
        if (!allCharacters || allCharacters.length === 0) return 1;
        const itemCount = allCharacters.length;
        
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
    }, [allCharacters]);

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
                        {allCharacters.map((character) => (
                            <Grid item xs={gridItemSize} key={character.CharacterHash}>
                                <FormControlLabel
                                    control={   
                                        <Checkbox
                                            checked={selectedCharacterHashes.has(character.CharacterHash)}
                                            onChange={() => handleCharacterToggle(character.CharacterHash)}
                                            size="small"
                                        />
                                    }
                                    label={character.CharacterName || `Character ${character.CharacterID}`}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </FormGroup>
            </Box>
        </Box>
    );
}

