import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useImportFitFromClipboard } from "../../../Hooks/GroupHooks/useImportFitFromClipboard";
import { ImportFittingItemRow } from "./importFittingItemRow";
import { showSnackbarError } from "../../../Events/snackbarEvents";
import { checkClipboardReadPermissions } from "../../../Functions/Clipboard/clipboardPermissions";

export function ImportItemFitDialogue({
  importFitDialogueTrigger,
  updateImportFitDialogueTrigger,
}) {
  const [clipboardReadAllowed, updateClipboardReadAllowed] = useState(false);
  const [importedItemList, updateImportedItemList] = useState([]);
  const [fitQuantityMultiplier, updateFitQuantityMultiplier] = useState(1);
  const { finalBuildRequests, importFromClipboard } =
    useImportFitFromClipboard();

  const handleClose = () => {
    updateClipboardReadAllowed(false);
    updateImportedItemList([]);
    updateFitQuantityMultiplier(1);
    updateImportFitDialogueTrigger((prev) => !prev);
  };

  useEffect(() => {
    async function checkClipboardPermission() {
      if (!importFitDialogueTrigger) return;

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
  }, [importFitDialogueTrigger]);
  return (
    <Dialog
      open={importFitDialogueTrigger}
      onClose={handleClose}
      sx={{ padding: "20px" }}
    >
      <DialogTitle color="primary" align="center">
        Import Fit
      </DialogTitle>
      <DialogContent>
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
      </DialogContent>
      <DialogActions sx={{ padding: "20px" }}>
        <Grid container>
          <Grid
            sx={{ marginBottom: { xs: "20px", sm: "0px" } }}
            size={{
              xs: 12,
              sm: 3
            }}>
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
                input: { inputProps: { step: "1", min: 1 } }
              }}
            />
          </Grid>
          <Grid sx={{ display: { xs: "none", sm: "block" } }} size={3} />
          <Grid
            align="center"
            size={{
              xs: 6,
              sm: 4
            }}>
            <Button
              disabled={importedItemList.length === 0 || !clipboardReadAllowed}
              size="small"
              variant="contained"
              onClick={async () => {
                await finalBuildRequests(importedItemList);
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
              sm: 2
            }}>
            <Button onClick={handleClose}>Close</Button>
          </Grid>
        </Grid>
      </DialogActions>
    </Dialog>
  );
}
