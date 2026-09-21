import {
  Box,
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
  META_LEVELS_THAT_REQUIRE_INVENTION_COSTS,
  TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS,
} from "../../../../../../Context/defaultValues";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../../../../Events/snackbarEvents";
import { formatNumberForLocale } from "../../../../../../Functions/Helper/numberParser";
import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import InventionEntry from "../../../../../../Classes/inventionEntry";
import {
  addInventionCost,
  removeInventionCost,
} from "../../../../Edit Job Hooks/jobCommands";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

/**
 * Whether invention is a cost this item can carry.
 *
 * Only a T2 or T3 item is invented, which its meta group says. The exceptions
 * are items whose meta group does not classify them the way the game charges
 * them for.
 *
 * @param {object} activeJob
 * @returns {boolean}
 */
export function invitesInvention(activeJob) {
  return (
    META_LEVELS_THAT_REQUIRE_INVENTION_COSTS.has(activeJob?.metaLevel) ||
    TYPE_IDS_TO_IGNORE_FOR_INVENTION_COSTS.has(activeJob?.itemID)
  );
}

/**
 * What invention consumed, and the means to record it.
 *
 * The attempts behind a blueprint are a cost the job carries and nothing else
 * accounts for, so this is shaped like the extras editor beside it rather than
 * like the card the Purchasing stage draws. Both write the same rows on the job,
 * so what is recorded here is what Purchasing shows.
 */
export default function InventionEditor() {
  const inventionEntries = useJobDraft((job) => job.build.inventionEntries);
  const actions = useJobActions();
  function handleAddAction(formData) {
    const itemName = DOMPurify.sanitize(
      String(formData.get("itemName") ?? ""),
      {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
      },
    ).trim();
    const itemCost = Number(formData.get("itemCost") ?? 0);

    if (!itemName) {
      showSnackbarError("Please enter what invention used");
      return;
    }

    if (!Number.isFinite(itemCost) || itemCost <= 0) {
      showSnackbarError("Please enter a valid cost amount");
      return;
    }

    actions.run(addInventionCost(InventionEntry.forItem(itemName, itemCost)));
    showSnackbarSuccess("Invention cost added");
  }

  function handleRemove(entry) {
    actions.run(removeInventionCost(entry));
    showSnackbarError("Invention cost removed");
  }

  const rows = Object.values(inventionEntries);

  return (
    <Stack spacing={1.5}>
      {rows.length > 0 ? (
        <Stack spacing={1}>
          {rows.map((entry) => (
            <InsetSurface
              key={entry.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
              }}
            >
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {entry.itemName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatNumberForLocale(entry.itemCost)} ISK
              </Typography>
              <Tooltip title="Remove invention cost" arrow placement="top">
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`Remove ${entry.itemName}`}
                  onClick={() => handleRemove(entry)}
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
          Nothing yet. Datacores, decryptors and the attempts that failed go
          here.
        </Typography>
      )}

      <Box component="form" action={handleAddAction}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "minmax(0, 5fr) minmax(0, 3fr) auto",
            },
            gap: 1,
            alignItems: "end",
          }}
        >
          <TextField
            fullWidth
            placeholder="What invention used…"
            name="itemName"
            variant="standard"
            size="small"
            helperText="Item"
          />
          <TextField
            fullWidth
            placeholder="0.00"
            name="itemCost"
            defaultValue="0"
            variant="standard"
            size="small"
            type="number"
            helperText="Cost"
            slotProps={{ htmlInput: { step: "0.01", min: "0" } }}
          />
          <Tooltip title="Add invention cost" arrow placement="top">
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
      aria-label="Add invention cost"
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
