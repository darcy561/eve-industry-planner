import { useState } from "react";
import ExplainerTooltip from "../../../../Styled Components/Tooltip/ExplainerTooltip";
import {
  Box,
  Chip,
  Divider,
  Typography,
  TextField,
  IconButton,
  Grid,
} from "@mui/material";

import {
  STANDARD_TEXT_FORMAT,
  permanentExtrasCategories,
} from "../../../../Context/defaultValues";
import useUsersStore from "../../../../Zustand/usersStore";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DOMPurify from "dompurify";
import UndoIcon from "@mui/icons-material/Undo";
import { scheduleDebouncedPlannerSettingsSave } from "../../../../Functions/Debounce/plannerSettingsPersistSchedule.js";
import { usePlannerExtrasCategories } from "../../../../Hooks/React Query/plannerSettings.js";

export default function CustomExtrasFrame() {
  const [newCategoryName, setNewCategoryName] = useState("");
  const { categories: extrasCategories, isHeld } = usePlannerExtrasCategories();
  const owner = useUsersStore((state) =>
    state.activePlanner.actions.getActivePlannerOwner(),
  );
  const { addPlannerExtrasCategory, setPlannerExtrasCategoryDeleted } =
    useUsersStore.getState().plannerSettings.actions;

  const handleAddCategory = () => {
    // Stripping markup can leave nothing behind, and a category with no label is
    // one the server refuses — so the name is checked after sanitising, not
    // before. The typed text stays, so the reader can see what was not accepted.
    const label = DOMPurify.sanitize(newCategoryName, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();
    if (!label) return;

    addPlannerExtrasCategory(owner, { id: crypto.randomUUID(), label });
    setNewCategoryName("");
    scheduleDebouncedPlannerSettingsSave(owner);
  };

  const setDeleted = (categoryID, deleted) => {
    setPlannerExtrasCategoryDeleted(owner, categoryID, deleted);
    scheduleDebouncedPlannerSettingsSave(owner);
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
              sm: 12,
            }}
          >
            <Typography variant="h6" color="primary">
              Extras Categories
            </Typography>
          </Grid>
          <Grid
            sx={{ padding: "20px" }}
            size={{
              xs: 12,
              sm: 12,
            }}
          >
            <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
              Extras categories are used to group costs together when
              calculating monthly expenses. Each planner keeps its own list,
              starting from a set of defaults, so everyone working in a planner
              files costs under the same categories.
              <br />
              <br />
              The <strong>Unassigned</strong> and <strong>Other</strong>{" "}
              categories are permanent and cannot be deleted.
              <br />
              <br />
              Deleted categories can be restored by clicking the{" "}
              <strong>Undo</strong> icon. Deleted categories remain available
              until the next monthly calculation is performed.
            </Typography>
          </Grid>
        </Grid>
        <Grid container>
          <Grid
            sx={{
              paddingX: "20px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
            size={{
              xs: 12,
              sm: 12,
            }}
          >
            <TextField
              label="Extra Category Name"
              variant="standard"
              size="small"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <ExplainerTooltip title="Adds the category to every job's extras, not just this one">
              <IconButton
                aria-label="Add extras category"
                onClick={handleAddCategory}
                disabled={!isHeld || !newCategoryName.trim()}
                color="primary"
              >
                <AddIcon />
              </IconButton>
            </ExplainerTooltip>
          </Grid>
          <Grid
            sx={{ padding: "20px" }}
            size={{
              xs: 12,
              sm: 12,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ marginBottom: "10px", fontWeight: "bold" }}
            >
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
                  deleteIcon={
                    !permanentExtrasCategories.has(extra.id) ? (
                      <CloseIcon />
                    ) : undefined
                  }
                  variant="outlined"
                  onDelete={
                    isHeld && !permanentExtrasCategories.has(extra.id)
                      ? () => setDeleted(extra.id, true)
                      : undefined
                  }
                />
              );
            })}
            <Box sx={{ height: "20px" }} />
            <Typography
              variant="subtitle2"
              sx={{ marginBottom: "10px", fontWeight: "bold" }}
            >
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
                  deleteIcon={isHeld ? <UndoIcon /> : undefined}
                  onDelete={
                    isHeld ? () => setDeleted(extra.id, false) : undefined
                  }
                />
              );
            })}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
