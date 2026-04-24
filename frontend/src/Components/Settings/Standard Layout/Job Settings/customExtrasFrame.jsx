import { useState } from "react";
import { Box, Chip, Divider, Typography, TextField, IconButton, Grid } from "@mui/material";

import { SMALL_TEXT_FORMAT, STANDARD_TEXT_FORMAT, permanentExtrasCategories } from "../../../../Context/defaultValues";
import useUsersStore from "../../../../Zustand/usersStore";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import uuid from "react-uuid";
import DOMPurify from "dompurify";
import UndoIcon from "@mui/icons-material/Undo";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

export default function CustomExtrasFrame() {
    const [newCategoryName, setNewCategoryName] = useState("");
    const extrasCategories = useUsersStore((state) => state.applicationSettings.extrasCategories);
    const { markExtrasCategoryAsDeleted, addExtrasCategory, unmarkExtrasCategoryAsDeleted } = useUsersStore.getState().applicationSettings.actions;

    const handleAddCategory = async () => {
        const sanitizedCategoryName = DOMPurify.sanitize(newCategoryName, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
        });
        addExtrasCategory({ id: uuid(), label: sanitizedCategoryName });
        setNewCategoryName("");
        scheduleDebouncedApplicationSettingsSave();
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
                            Extras Categories
                        </Typography>
                    </Grid>
                    <Grid
                        sx={{ padding: "20px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                            Extras categories are used to group costs together when calculating monthly expenses. The application provides a set of default categories, which can be customised as needed.
                            <br /><br />
                            The <strong>Unassigned</strong> and <strong>Other</strong> categories are permanent and cannot be deleted.
                            <br /><br />
                            Deleted categories can be restored by clicking the <strong>Undo</strong> icon. Deleted categories remain available until the next monthly calculation is performed.
                        </Typography>
                    </Grid>
                </Grid>
                <Grid container>
                    <Grid
                        sx={{ paddingX: "20px", display: "flex", alignItems: "center", gap: "10px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        <TextField
                            label="Extra Category Name"
                            variant="standard"
                            size="small"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            sx={{ flexGrow: 1 }}
                        />
                        <IconButton
                            onClick={handleAddCategory}
                            disabled={!newCategoryName.trim()}
                            color="primary"
                        >
                            <AddIcon />
                        </IconButton>
                    </Grid>
                    <Grid
                        sx={{ padding: "20px" }}
                        size={{
                            xs: 12,
                            sm: 12
                        }}>
                        <Typography variant="subtitle2" sx={{ marginBottom: "10px", fontWeight: "bold" }}>
                            Active Categories
                        </Typography>
                        {extrasCategories.map((extra) => {
                            if (extra?.deleted) return null;
                            return (
                                <Chip
                                    key={`${extra.id}-custom-extra-category`}
                                    label={extra.label}
                                    sx={{
                                        margin: "5px",
                                        "& .MuiChip-deleteIcon": {
                                            color: "error.main",
                                        },
                                        boxShadow: 3,
                                    }}
                                    deleteIcon={!permanentExtrasCategories.has(extra.id) ? <CloseIcon /> : undefined}
                                    variant="outlined"
                                    onDelete={!permanentExtrasCategories.has(extra.id) ? async () => {
                                        markExtrasCategoryAsDeleted(extra.id);
                                        scheduleDebouncedApplicationSettingsSave();
                                    } : undefined}

                                />
                            )
                        })}
                        <Box sx={{ height: "20px" }} />
                        <Typography variant="subtitle2" sx={{ marginBottom: "10px", fontWeight: "bold" }}>
                            Deleted Categories
                        </Typography>
                        {extrasCategories.map((extra) => {
                            if (!extra?.deleted) return null;
                            return (
                                <Chip
                                    key={`${extra.id}-deleted-extra-category`}
                                    label={extra.label}
                                    sx={{
                                        margin: "5px",
                                        opacity: 0.5,
                                        textDecoration: "line-through",
                                        boxShadow: 1,
                                    }}
                                    variant="outlined"
                                    deleteIcon={<UndoIcon />}
                                    onDelete={async () => {
                                        unmarkExtrasCategoryAsDeleted(extra.id);
                                        scheduleDebouncedApplicationSettingsSave();
                                    }}
                                />
                            )
                        })}

                    </Grid>
                </Grid>
            </Box>
        </Box>
    );

}