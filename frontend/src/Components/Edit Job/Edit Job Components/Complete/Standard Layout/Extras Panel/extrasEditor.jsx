import { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useFormStatus } from "react-dom";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DOMPurify from "dompurify";

import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import ExtrasCategoriesSelect from "../../../../../../Styled Components/Select/extrasCategories";
import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import ExtraCost from "../../../../../../Classes/extraCost";
import { usePlannerExtrasCategories } from "../../../../../../Hooks/React Query/plannerSettings.js";

/**
 * The costs a build carries that nothing else accounts for, and the means to add
 * and remove them.
 *
 * Shared rather than rendered twice: the Planning stage costs a build before it
 * happens and the Complete stage records what it actually cost, and both need
 * the same list and the same form.
 *
 * @param {object} props
 * @param {object} props.state - Edit Job state
 * @param {object} props.actions - Edit Job actions
 */
export default function ExtrasEditor({ state, actions }) {
  const [extrasCategory, setExtrasCategory] = useState("0");
  const { categories: extrasCategories } = usePlannerExtrasCategories();

  // Consulted when an extra is added, to name the category it was filed under.
  // A stored row already carries its name and does not come back here.
  const lookUpCategoryLabel = (categoryId) => {
    const n = Number(ExtraCost.categoryOf(categoryId));
    const safeCategoryId = Number.isFinite(n) ? n : 0;
    const category = extrasCategories.find(
      (cat) =>
        cat.id === safeCategoryId || String(cat.id) === String(categoryId),
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

  const rows = state.activeJob.build.costs.extrasCosts;

  return (
    <Stack spacing={1.5}>
      {rows.length > 0 ? (
        <Stack spacing={1}>
          {rows.map((item) => (
            <InsetSurface
              key={item.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Chip
                  label={item.categoryLabel}
                  size="small"
                  variant="filled"
                  color="secondary"
                  sx={{ mb: 0.5, fontSize: "0.7rem", height: 20 }}
                />
                <Typography variant="body2" noWrap>
                  {item.extraText}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                {formatNumberForLocale(item.extraValue)} ISK
              </Typography>
              <Tooltip title="Remove extra cost" arrow placement="top">
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Remove ${item.extraText || item.categoryLabel}`}
                  onClick={() => handleRemove(item)}
                  sx={{ p: 0.5 }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InsetSurface>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Nothing yet. Hauling, copies and loyalty point costs go here.
        </Typography>
      )}

      <Box component="form" action={handleAddAction}>
        <input type="hidden" name="extrasCategory" value={extrasCategory} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "minmax(0, 3fr) minmax(0, 4fr) minmax(0, 3fr) auto",
            },
            gap: 1,
            alignItems: "end",
          }}
        >
          <ExtrasCategoriesSelect
            value={extrasCategory}
            onChange={(id) =>
              setExtrasCategory(id == null || id === "" ? "0" : String(id))
            }
          />
          <TextField
            fullWidth
            placeholder="Enter description…"
            name="extraText"
            variant="standard"
            size="small"
            helperText="Description"
          />
          <TextField
            fullWidth
            placeholder="0.00"
            name="extraValue"
            defaultValue="0"
            variant="standard"
            size="small"
            type="number"
            helperText="Cost"
            slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
          />
          <Tooltip title="Add Extra Cost" arrow placement="top">
            <Box>
              <PendingAddIconButton />
            </Box>
          </Tooltip>
        </Box>
      </Box>
    </Stack>
  );
}

function PendingAddIconButton() {
  const { pending } = useFormStatus();

  return (
    <IconButton
      color="primary"
      type="submit"
      size="small"
      aria-label="Add extra cost"
      disabled={pending}
      sx={{
        backgroundColor: "primary.main",
        color: "white",
        "&:hover": { backgroundColor: "primary.dark" },
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
