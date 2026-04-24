import { Button, Grid, TextField, Typography } from "@mui/material";
import ContentDialog, {
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  finalBuildRequests,
  importFromClipboard,
} from "../../../Functions/JobPlanner/importFitFromClipboard";
import { ImportFittingItemRow } from "./importFittingItemRow";
import { showSnackbarError } from "../../../Events/snackbarEvents";
import { checkClipboardReadPermissions } from "../../../Functions/Clipboard/clipboardPermissions";
import { IMPORT_FIT_DIALOG_EVENT } from "../../../Events/importFitDialogEvents";

export default function ImportFitDialog() {
  const [messageData, , resetDialog] = useDialogEventState(
    IMPORT_FIT_DIALOG_EVENT,
    () => ({ isOpen: false }),
  );
  const [clipboardReadAllowed, updateClipboardReadAllowed] = useState(false);
  const [importedItemList, updateImportedItemList] = useState([]);
  const [fitQuantityMultiplier, updateFitQuantityMultiplier] = useState(1);
  const queryClient = useQueryClient();

  const handleClose = () => {
    updateClipboardReadAllowed(false);
    updateImportedItemList([]);
    updateFitQuantityMultiplier(1);
    resetDialog();
  };

  useEffect(() => {
    async function checkClipboardPermission() {
      if (!messageData.isOpen) return;

      try {
        const queryResult = await checkClipboardReadPermissions();
        if (!queryResult) {
          updateClipboardReadAllowed(queryResult);
          return;
        }
        const { importedItems } = await importFromClipboard();
        updateClipboardReadAllowed(queryResult);
        updateImportedItemList(importedItems);
      } catch (error) {
        console.error("Failed to import from clipboard:", error);
        updateClipboardReadAllowed(false);
        showSnackbarError(error.message || "Failed to import from clipboard");
      }
    }
    checkClipboardPermission();
  }, [messageData.isOpen, importFromClipboard]);

  return (
    <ContentDialog
      open={messageData.isOpen}
      onClose={handleClose}
      title="Import Fit"
      componentName="ImportItemFitDialogue"
      maxWidth={false}
      dialogSx={{ padding: "20px" }}
      dialogActionsProps={{ sx: { padding: "20px" } }}
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
    </ContentDialog>
  );
}
