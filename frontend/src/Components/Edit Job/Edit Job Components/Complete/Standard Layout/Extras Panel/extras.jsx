import { useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  TextField,
  Typography,
  Tooltip,
  Grid,
} from "@mui/material";

import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale, numberToShortText } from "../../../../../../Functions/Helper/numberParser";
import uuid from "react-uuid";
import ExtrasCategoriesSelect from "../../../../../../Styled Components/Select/extrasCategories";
import useUsersStore from "../../../../../../Zustand/usersStore";
import DOMPurify from "dompurify";
import ContentPanel from "../../../../../../Styled Components/Paper/ContentPanel";

export function ExtrasPanel({ state, actions }) {
  const [extras, updateExtras] = useState({ category: 0, text: "", value: 0 });
  const extrasCategories = useUsersStore((state) => state.applicationSettings.extrasCategories);

  const getCategoryLabel = (categoryId) => {
    // Category may be number (new row) or string (e.g. from Mongo after import).
    const n =
      categoryId == null || categoryId === ""
        ? 0
        : Number(categoryId);
    const safeCategoryId = Number.isFinite(n) ? n : 0;
    const category = extrasCategories.find(
      (cat) => cat.id === safeCategoryId || String(cat.id) === String(categoryId)
    );
    return category ? category.label : "Unassigned";
  };

  function handleAdd() {
    if (extras.category === 0 && !extras.text.trim()) {
      showSnackbarError("Please enter a description");
      return;
    }

    if (extras.value <= 0) {
      showSnackbarError("Please enter a valid cost amount");
      return;
    }

    const sanitizedText = DOMPurify.sanitize(extras.text, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    });

    // Persisted shape for each row: { id, category, extraText, extraValue } (see Job.addExtrasCost, models.ExtraCost).
    state.activeJob.addExtrasCost({
      id: uuid(),
      category: extras.category || 0,
      extraText: sanitizedText,
      extraValue: extras.value,
    });

    actions.updateActiveJob(state.activeJob);
    updateExtras({ category: 0, text: "", value: 0 });
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
                      label={getCategoryLabel(item.category)}
                      size="small"
                      variant="filled"
                      color="secondary"
                      sx={{ mb: 0.5, fontSize: '0.7rem', height: 20 }}
                    />
                    <Typography variant="body2" noWrap>
                      {item.extraText}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mx: 2 }}>
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
          <Grid container spacing={1} sx={{ width: '100%' }}>
            <Grid
              size={{
                xs: 12,
                sm: 3
              }}>
              <ExtrasCategoriesSelect
                value={extras.category}
                onChange={(e) => {
                  updateExtras((prevState) => ({
                    ...prevState,
                    category: e,
                  }));
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
                value={extras.text}
                onChange={(e) => {
                  updateExtras((prevState) => ({
                    ...prevState,
                    text: e.target.value,
                  }));
                }}
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
                <Tooltip title={numberToShortText(extras.value)} arrow placement="top">
              <TextField
                fullWidth
                placeholder="0.00"
                value={extras.value || ""}
                onChange={(e) => {
                  updateExtras((prevState) => ({
                    ...prevState,
                    value: Number(e.target.value) || 0,
                  }));
                }}
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
              </Tooltip>
            </Grid>
            <Grid
              sx={{ minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              size={{
                xs: 6,
                sm: 2
              }}>
              <Tooltip title="Add Extra Cost" arrow placement="top">
                <Box>
                  <IconButton
                    color="primary"
                    onClick={handleAdd}
                    disabled={
                      (extras.category === 0 ? !extras.text.trim() : false) ||
                      extras.value <= 0
                    }
                    size="small"
                    sx={{
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                      '&:disabled': {
                        backgroundColor: 'action.disabled',
                        color: 'action.disabled',
                      }
                    }}
                  >
                    <AddIcon />
                  </IconButton>
                </Box>
              </Tooltip>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}