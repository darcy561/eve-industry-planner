import { FormGroup, FormControlLabel, Checkbox, Typography, Box, RadioGroup, Radio } from "@mui/material";
import { STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import useUsersStore from "../../../Zustand/usersStore";

function UseAssetsButton_ShoppingList({
    state,
    actions,
}) {
    const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);

    if (!isLoggedIn) return null;

    const isAssetsEnabled = state.assetType !== null;

    return (
        <FormGroup>
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    alignItems: "flex-start",
                }}
            >
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={isAssetsEnabled}
                            onChange={() => {
                                // Toggle between null and "character" (default)
                                actions.setAssetType(isAssetsEnabled ? null : "character");
                            }}
                        />
                    }
                    label={
                        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                            Apply Assets From ESI
                        </Typography>
                    }
                    labelPlacement="end"
                    sx={{
                        margin: 0,
                    }}
                />
                {isAssetsEnabled && (
                    <Box sx={{ marginLeft: "40px", marginTop: "10px" }}>
                        <RadioGroup
                            value={state.assetType}
                            onChange={(e) => {
                                actions.setAssetType(e.target.value);
                            }}
                            row
                            sx={{
                                gap: "20px",
                            }}
                        >
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                }}
                            >
                                <Radio
                                    size="small"
                                    value="character"
                                    checked={state.assetType === "character"}
                                    onChange={(e) => {
                                        actions.setAssetType(e.target.value);
                                    }}
                                />
                                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                                    Character Assets
                                </Typography>
                            </Box>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                }}
                            >
                                <Radio
                                    size="small"
                                    value="corporation"
                                    checked={state.assetType === "corporation"}
                                    onChange={(e) => {
                                        actions.setAssetType(e.target.value);
                                    }}
                                />
                                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                                    Corporation Assets
                                </Typography>
                            </Box>
                        </RadioGroup>
                    </Box>
                )}
            </Box>
        </FormGroup>
    );
}

export default UseAssetsButton_ShoppingList;