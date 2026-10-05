import { Button, Grid, TextField, Typography } from "@mui/material";
import ContentDialogue, {
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  finalBuildRequests,
  importFromClipboard,
} from "../../../Functions/Job/building/importFitFromClipboard";
import { ImportFittingItemRow } from "./importFittingItemRow";
import { showSnackbarError } from "../../../Events/snackbarEvents";
import { checkClipboardReadPermissions } from "../../../Functions/Clipboard/clipboardPermissions";
import { IMPORT_FIT_DIALOGUE_EVENT } from "../../../Events/importFitDialogueEvents";

/**
 * Reads an EVE fit off the clipboard and offers its items as jobs.
 *
 * Nothing mounts this yet — the import-fit feature it belongs to has not shipped,
 * and `showImportFitDialogue()` has no caller. It is kept current with the rest of
 * the dialogues so that mounting it is all that is left to do.
 */
export default function ImportFitDialogue() {
  const [messageData, , resetDialogue] = useDialogueEventState(
    IMPORT_FIT_DIALOGUE_EVENT,
    () => ({ isOpen: false }),
  );

  if (!messageData.isOpen) return null;

  return <ImportFitDialogueBody onDismiss={resetDialogue} />;
}

/**
 * @param {Object} props
 * @param {Function} props.onDismiss - Puts the dialogue away
 */
function ImportFitDialogueBody({ onDismiss }) {
  const [clipboardReadAllowed, updateClipboardReadAllowed] = useState(false);
  const [importedItemList, updateImportedItemList] = useState([]);
  const [fitQuantityMultiplier, updateFitQuantityMultiplier] = useState(1);
  const queryClient = useQueryClient();

  /* What was read goes with the dialogue: it is unmounted on close. */
  const handleClose = onDismiss;

  /* The clipboard is outside React and is read once, as the dialogue opens. A
   * reader who closes it before the read finishes must not be written to. */
  useEffect(() => {
    let dismissed = false;

    async function readTheFitOnTheClipboard() {
      try {
        const readAllowed = await checkClipboardReadPermissions();
        if (dismissed) return;
        if (!readAllowed) {
          updateClipboardReadAllowed(false);
          return;
        }
        const { importedItems } = await importFromClipboard();
        if (dismissed) return;
        updateClipboardReadAllowed(true);
        updateImportedItemList(importedItems);
      } catch (error) {
        if (dismissed) return;
        console.error("Failed to import from clipboard:", error);
        updateClipboardReadAllowed(false);
        showSnackbarError(error.message || "Failed to import from clipboard");
      }
    }

    readTheFitOnTheClipboard();
    return () => {
      dismissed = true;
    };
  }, []);

  return (
    <ContentDialogue
      open
      onClose={handleClose}
      title="Import Fit"
      componentName="ImportItemFitDialogue"
      maxWidth={false}
      dialogueSx={{ padding: "20px" }}
      dialogueActionsProps={{ sx: { padding: "20px" } }}
      actions={
        <Grid container>
          <Grid
            sx={{ marginBottom: { xs: "20px", sm: "0px" } }}
            size={{
              xs: 12,
              sm: 3,
            }}
          >
            <TextField
              disabled={importedItemList.length === 0 || !clipboardReadAllowed}
              fullWidth
              sx={{
                "& .MuiFormHelperText-root": {
                  color: (theme) => theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
              }}
              size="size"
              variant="standard"
              helperText="Fit Quantity"
              type="number"
              value={fitQuantityMultiplier}
              onChange={(e) => {
                const newItemArray = importedItemList.map((entry) => {
                  entry.itemCalculatedQty =
                    entry.itemBaseQty * Math.round(e.target.value);
                  return entry;
                });
                updateImportedItemList(newItemArray);
                updateFitQuantityMultiplier(Math.round(e.target.value));
              }}
              slotProps={{
                input: { inputProps: { step: "1", min: 1 } },
              }}
            />
          </Grid>
          <Grid sx={{ display: { xs: "none", sm: "block" } }} size={3} />
          <Grid
            align="center"
            size={{
              xs: 6,
              sm: 4,
            }}
          >
            <Button
              disabled={importedItemList.length === 0 || !clipboardReadAllowed}
              size="small"
              variant="contained"
              onClick={async () => {
                await finalBuildRequests(importedItemList, queryClient);
                handleClose();
              }}
            >
              Import Items
            </Button>
          </Grid>
          <Grid
            align="center"
            size={{
              xs: 6,
              sm: 2,
            }}
          >
            <Button onClick={handleClose}>Close</Button>
          </Grid>
        </Grid>
      }
    >
      <Grid container>
        {!clipboardReadAllowed ? (
          <Grid size={12}>
            <Typography align="center"> No Access To Clipboard</Typography>
          </Grid>
        ) : importedItemList.length > 0 ? (
          importedItemList.map((item, index) => {
            return (
              <ImportFittingItemRow
                key={item.itemID}
                updateImportedItemList={updateImportedItemList}
                item={item}
                index={index}
              />
            );
          })
        ) : (
          <Grid size={12}>
            <Typography align="center">No Imported Items</Typography>
          </Grid>
        )}
      </Grid>
    </ContentDialogue>
  );
}
