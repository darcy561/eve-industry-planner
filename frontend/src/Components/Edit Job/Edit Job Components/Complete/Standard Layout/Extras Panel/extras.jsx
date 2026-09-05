import { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
  Tooltip,
  Grid,
} from "@mui/material";
import { useFormStatus } from "react-dom";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ExtrasCategoriesSelect from "../../../../../../Styled Components/Select/extrasCategories";
import useUsersStore from "../../../../../../Zustand/usersStore";
import DOMPurify from "dompurify";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";
import ExtraCost from "../../../../../../Classes/extraCost";

export function ExtrasPanel({ state, actions }) {
  const [extrasCategory, setExtrasCategory] = useState("0");
  const extrasCategories = useUsersStore((state) => state.applicationSettings.extrasCategories);

  // Consulted when an extra is added, to name the category it was filed under.
  // A stored row already carries its name and does not come back here.
  const lookUpCategoryLabel = (categoryId) => {
    const n = Number(ExtraCost.categoryOf(categoryId));
    const safeCategoryId = Number.isFinite(n) ? n : 0;
    const category = extrasCategories.find(
      (cat) => cat.id === safeCategoryId || String(cat.id) === String(categoryId)
    );
    return category ? category.label : "";
  };

  function handleAddAction(formData) {
    const extraText = String(formData.get("extraText") ?? "");
    const extraValue = Number(formData.get("extraValue") ?? 0);
    const rawCategory = formData.get("extrasCategory");
    const category =
      rawCategory == null || rawCategory === "" ? "0" : String(rawCategory);

    if (category === "0" && !extraText.trim()) {
      showSnackbarError("Please enter a description");
      return;
    }

    if (!Number.isFinite(extraValue) || extraValue <= 0) {
      showSnackbarError("Please enter a valid cost amount");
      return;
    }

    const sanitizedText = DOMPurify.sanitize(extraText, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });

    state.activeJob.addExtrasCost(
      new ExtraCost({
        id: crypto.randomUUID(),
        category,
        categoryLabel: lookUpCategoryLabel(category),
        extraText: sanitizedText,
        extraValue,
      }),
    );

    actions.updateActiveJob(state.activeJob);
    showSnackbarSuccess("Extra cost added");
  }

  function handleRemove(item) {
    state.activeJob.removeExtrasCost(item);
    actions.updateActiveJob(state.activeJob);
    showSnackbarError("Extra cost removed");
  }

  return (
    <ContentPanel 
      title="Extra Costs"
      paperSx={{ height: "auto" }}
    >
      <Grid container spacing={1} sx={{ width: '100%' }}>

        {/* Existing Extra Costs */}
        {state.activeJob.build.costs.extrasCosts.length > 0 && (
          <Grid size={12}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {state.activeJob.build.costs.extrasCosts.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'action.hover',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Chip
                      label={item.categoryLabel}
                      size="small"
                      variant="filled"
                      color="secondary"
                      sx={{ mb: 0.5, fontSize: '0.7rem', height: 20 }}
                    />
                    <Typography variant="body2" noWrap>
                      {item.extraText}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      mx: 2
                    }}>
                    {formatNumberForLocale(item.extraValue)} ISK
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemove(item)}
                    sx={{ p: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Grid>
        )}

        {/* Add New Extra Cost */}
        <Grid size={12}>
          <Typography variant="subtitle2" gutterBottom>
            Add Extra Cost
          </Typography>
          <Box component="form" action={handleAddAction}>
          <input type="hidden" name="extrasCategory" value={extrasCategory} />
          <Grid container spacing={1} sx={{ width: '100%' }}>
            <Grid
              size={{
                xs: 12,
                sm: 3
              }}>
              <ExtrasCategoriesSelect
                value={extrasCategory}
                onChange={(id) => {
                  setExtrasCategory(
                    id == null || id === "" ? "0" : String(id)
                  );
                }}
              />
            </Grid>
            <Grid
              size={{
                xs: 12,
                sm: 4
              }}>
              <TextField
                fullWidth
                placeholder="Enter description..."
                name="extraText"
                variant="standard"
                size="small"
                helperText="Description"
              />
            </Grid>
            <Grid
              sx={{ minWidth: 0 }}
              size={{
                xs: 6,
                sm: 3
              }}>
              <TextField
                fullWidth
                placeholder="0.00"
                name="extraValue"
                defaultValue="0"
                variant="standard"
                size="small"
                type="number"
                helperText="Cost"
                slotProps={{
                  htmlInput: {
                    step: "0.01",
                    min: "0"
                  }
                }}
              />
            </Grid>
            <Grid
              sx={{ minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              size={{
                xs: 6,
                sm: 2
              }}>
              <Tooltip title="Add Extra Cost" arrow placement="top">
                <Box>
                  <PendingAddIconButton />
                </Box>
              </Tooltip>
            </Grid>
          </Grid>
          </Box>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}

function PendingAddIconButton() {
  const { pending } = useFormStatus();

  return (
    <IconButton
      color="primary"
      type="submit"
      size="small"
      disabled={pending}
      sx={{
        backgroundColor: "primary.main",
        color: "white",
        "&:hover": {
          backgroundColor: "primary.dark",
        },
        "&:disabled": {
          backgroundColor: "action.disabled",
          color: "action.disabled",
        },
      }}
    >
      {pending ? <CircularProgress size={16} color="inherit" /> : <AddIcon />}
    </IconButton>
  );
}