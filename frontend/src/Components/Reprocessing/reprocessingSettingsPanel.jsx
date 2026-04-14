import {
    Box,
    Divider,
    Typography,
    FormControl,
    FormLabel,
    FormHelperText,
    Switch,
    Slider,
    Grid,
    Chip,
    Stack,
    Collapse,
    IconButton,
    Button,
    Tooltip
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SaveIcon from "@mui/icons-material/Save";
import RestoreIcon from "@mui/icons-material/Restore";
import { useState, useEffect } from "react";
import useUsersStore from "../../Zustand/usersStore";
import { useCachedData } from "../../Hooks/useCachedData";
import { CACHED_DATA_FILES, DEFAULT_REPROCESSING_CALCULATION_SETTINGS } from "../../Context/defaultValues";
import { saveApplicationSettings } from "../../Functions/Endpoints/Pirivate/userDocument";
import { showSnackbarSuccess } from "../../Events/snackbarEvents";
import { useGlobalDebounce } from "../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../Context/debounceKeys";

export default function ReprocessingSettingsPanel({ pageState, pageActions }) {
    const { data: fullItemList } = useCachedData(CACHED_DATA_FILES.FULL_ITEM_LIST);
    const updateReprocessingSettings = useUsersStore((state) => state.applicationSettings.actions.updateReprocessingCalculationSettings);
    const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
    const exemptTypeIDs = pageState.oreIDsToBeIgnored || [];
    const reprocessingSettings = pageState.reprocessingCalculationSettings;

    // State for expandable panel
    const [expanded, setExpanded] = useState(false);

    const debouncedSaveSettings = useGlobalDebounce(
        DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
        async () => {
            await saveApplicationSettings();
        },
        2000
    );

    // Open by default if there are exempt ores
    useEffect(() => {
        if (exemptTypeIDs.length > 0) {
            setExpanded(true);
        }
    }, [exemptTypeIDs.length]);

    // Handle settings changes
    const handleSettingChange = (setting, value) => {
        const newSettings = { [setting]: value };
        pageActions.setReprocessingCalculationSettings(newSettings);
    };

    // Remove exempt ore
    const handleRemoveExemptOre = (typeID) => {
        pageActions.removeOreIDToBeIgnored(typeID);
    };

    // Get ore name by typeID
    const getOreName = (typeID) => {
        if (!fullItemList) return `TypeID: ${typeID}`;
        const item = fullItemList[typeID];
        return item ? item.name : `TypeID: ${typeID}`;
    };

    // Toggle expanded state
    const toggleExpanded = () => {
        setExpanded(!expanded);
    };

    // Save current settings as default
    const handleSaveAsDefault = () => {
        updateReprocessingSettings(reprocessingSettings);
        debouncedSaveSettings();
        showSnackbarSuccess("Reprocessing settings saved as default");
    };

    // Revert settings to default
    const handleRevertToDefault = () => {
        pageActions.setReprocessingCalculationSettings(DEFAULT_REPROCESSING_CALCULATION_SETTINGS);
        updateReprocessingSettings(DEFAULT_REPROCESSING_CALCULATION_SETTINGS);
        showSnackbarSuccess("Reprocessing settings reverted to default");
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">
                    Reprocessing Settings
                </Typography>
                <IconButton onClick={toggleExpanded} size="small">
                    {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
            </Box>
            <Collapse in={expanded}>
                {/* Settings Action Buttons - only show for logged in users */}
                {isLoggedIn && (
                    <Box sx={{ mb: 2, textAlign: 'right', display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Tooltip title="Revert to default settings" arrow placement="top">
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<RestoreIcon />}
                                onClick={handleRevertToDefault}
                            >
                                Revert to Default
                            </Button>
                        </Tooltip>
                        <Tooltip title="Save current settings" arrow placement="top">
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<SaveIcon />}
                                onClick={handleSaveAsDefault}
                            >
                                Save as Default
                            </Button>
                        </Tooltip>
                    </Box>
                )}

                {/* Reprocessing Calculation Settings */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" gutterBottom>
                        Calculation Settings
                    </Typography>

                    <Grid container spacing={2}>
                        {/* Prefer Compressed Toggle */}
                        <Grid
                            size={{
                                xs: 12,
                                sm: 6
                            }}>
                            <FormControl component="fieldset">
                                <FormLabel component="legend">Prefer Compressed Ores</FormLabel>
                                <Switch
                                    checked={reprocessingSettings.preferCompressed}
                                    onChange={(e) => handleSettingChange('preferCompressed', e.target.checked)}
                                    color="primary"
                                />
                                <FormHelperText>
                                    Prioritises compressed ores over raw ores when both are available. Compressed ores provide better mineral yields per unit.
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        {/* Sell Excess Mineral Types Toggle */}
                        <Grid
                            size={{
                                xs: 12,
                                sm: 6
                            }}>
                            <FormControl component="fieldset">
                                <FormLabel component="legend">Sell Excess Mineral Types</FormLabel>
                                <Switch
                                    checked={reprocessingSettings.sellExcessMineralTypes}
                                    onChange={(e) => handleSettingChange('sellExcessMineralTypes', e.target.checked)}
                                    color="primary"
                                />
                                <FormHelperText>
                                    When enabled, excess mineral types beyond what's needed are as assumed to be sold instead of kept in inventory.
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        {/* Compression Bonus Multiplier */}
                        <Grid
                            size={{
                                xs: 12,
                                sm: 6
                            }}>
                            <FormControl component="fieldset" fullWidth>
                                <FormLabel component="legend">
                                    Compression Bonus Multiplier: {reprocessingSettings.compressionBonusMultiplier}
                                </FormLabel>
                                <Slider
                                    value={reprocessingSettings.compressionBonusMultiplier}
                                    onChangeCommitted={(e, value) => handleSettingChange('compressionBonusMultiplier', value)}
                                    min={0}
                                    max={0.5}
                                    step={0.01}
                                    disabled={!reprocessingSettings.preferCompressed}
                                    marks={[
                                        { value: 0, label: '0' },
                                        { value: 0.25, label: '0.25' },
                                        { value: 0.5, label: '0.5' },
                                    ]}
                                    valueLabelDisplay="auto"
                                />
                                <FormHelperText>
                                    Higher values make the algorithm prefer compressed ores more strongly. 0.25 is the standard compression bonus.
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        {/* Value Multiplier */}
                        <Grid
                            size={{
                                xs: 12,
                                sm: 6
                            }}>
                            <FormControl component="fieldset" fullWidth>
                                <FormLabel component="legend">
                                    Value Multiplier: {reprocessingSettings.valueMultiplier}
                                </FormLabel>
                                <Slider
                                    value={reprocessingSettings.valueMultiplier}
                                    onChangeCommitted={(e, value) => handleSettingChange('valueMultiplier', value)}
                                    min={0}
                                    max={4}
                                    step={0.1}
                                    marks={[
                                        { value: 0, label: '0' },
                                        { value: 1, label: '1' },
                                        { value: 2, label: '2' },
                                        { value: 4, label: '4' }
                                    ]}
                                    valueLabelDisplay="auto"
                                />
                                <FormHelperText>
                                    Higher values prioritize cost-effectiveness over mineral yield. 2.0 balances cost and efficiency well.
                                </FormHelperText>
                            </FormControl>
                        </Grid>

                        {/* Waste Penalty Multiplier */}
                        <Grid
                            size={{
                                xs: 12,
                                sm: 6
                            }}>
                            <FormControl component="fieldset" fullWidth>
                                <FormLabel component="legend">
                                    Waste Penalty Multiplier: {reprocessingSettings.wastePenaltyMultiplier}
                                </FormLabel>
                                <Slider
                                    value={reprocessingSettings.wastePenaltyMultiplier}
                                    onChangeCommitted={(e, value) => handleSettingChange('wastePenaltyMultiplier', value)}
                                    min={0}
                                    max={0.5}
                                    step={0.01}
                                    marks={[
                                        { value: 0, label: '0' },
                                        { value: 0.1, label: '0.1' },
                                        { value: 0.5, label: '0.5' },
                                    ]}
                                    valueLabelDisplay="auto"
                                />
                                <FormHelperText>
                                    Higher values penalise ores that produce excess minerals you don't need. 0.1 is a good starting point.
                                </FormHelperText>
                            </FormControl>
                        </Grid>
                    </Grid>
                </Box>

                {/* Exempt Ores Display */}
                {exemptTypeIDs.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            Exempt Ores ({exemptTypeIDs.length})
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            These ores are excluded from reprocessing calculations
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {exemptTypeIDs.map((typeID) => (
                                <Chip
                                    key={typeID}
                                    label={getOreName(typeID)}
                                    onDelete={() => handleRemoveExemptOre(typeID)}
                                    color="secondary"
                                    variant="outlined"
                                    size="small"
                                />
                            ))}
                        </Stack>
                    </Box>
                )}
            </Collapse>
            <Divider sx={{ marginY: 2 }} />
        </Box>
    );
}