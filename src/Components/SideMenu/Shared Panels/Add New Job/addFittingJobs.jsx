import { Box, Button, Grid, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useHelperFunction } from "../../../../Hooks/GeneralHooks/useHelperFunctions";
import { useImportFitFromClipboard } from "../../../../Hooks/GroupHooks/useImportFitFromClipboard";
import FittingImportRow from "./fittingRow";
import uuid from "react-uuid";

function AddShipFittingPanel({ updateItemIDsToAdd, addNewGroupOnBuild }) {
  const [clipboardReadAllowed, updateClipboardReadAllowed] = useState(false);
  const [importedFitData, updateImportedFitData] = useState([]);
  const [importedFitName, updateImportedFitName] = useState("");
  const [fitQuantityMultiplier, updateFitQuantityMultiplier] = useState(1);
  const { checkClipboardReadPermissions, sendSnackbarNotificationError } =
    useHelperFunction();
  const { importFromClipboard, convertImportedItemsToBuildRequests } =
    useImportFitFromClipboard();

  useEffect(() => {
    async function clipboardPermissions() {
      const permission = await checkClipboardReadPermissions();
      updateClipboardReadAllowed(permission);
    }

    clipboardPermissions();
  }, []);

  async function importClipboardItems() {
    const { importedItems, fittingName } = await importFromClipboard();

    if (importedItems.length < 1) {
      sendSnackbarNotificationError("No Fitting Found On Clipboard", 3);
      return;
    }

    updateImportedFitData(importedItems);
    updateImportedFitName(fittingName);
  }

  function addToBuildQueue() {
    const buildRequests = convertImportedItemsToBuildRequests(importedFitData);
    updateItemIDsToAdd((prev) => {
      const newItemsToAdd = prev.map((item) => ({ ...item }));

      buildRequests.forEach((request) => {
        const existingObject = newItemsToAdd.find(
          (i) => i.itemID === request.itemID
        );

        if (existingObject) {
          existingObject.itemQty += request.itemQty;
        } else {
          newItemsToAdd.push({
            itemID: request.itemID,
            itemQty: request.itemQty,
            addNewGroup: addNewGroupOnBuild,
          });
        }
      });
      return newItemsToAdd;
    });
    updateImportedFitData([]);
    updateImportedFitName("");
    updateFitQuantityMultiplier(1);
  }

  return (
    <Box sx={{ height: "60%" }}>
      <Grid container>
        <Grid item align="center">
          <Button
            size="small"
            disabled={!clipboardReadAllowed}
            variant="contained"
            onClick={importClipboardItems}
          >
            Import Fit From Clipboard
          </Button>

          {!clipboardReadAllowed && (
            <Typography variant="caption" color="error">
              No Clipboard Access
            </Typography>
          )}
        </Grid>
        <Grid container item xs={12} sx={{ overflow: "auto" }}>
          {importedFitData.length > 0 && (
            <Grid container item xs={12}>
              <Grid item xs={6}>
                <Button onClick={addToBuildQueue}>Add To Build List</Button>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  disabled={
                    importedFitData.length === 0 || !clipboardReadAllowed
                  }
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
                  InputProps={{ inputProps: { step: "1", min: 1 } }}
                  onChange={(e) => {
                    const newFitData = importedFitData.map((entry) => {
                      entry.itemCalculatedQty =
                        entry.itemBaseQty * Math.round(e.target.value);
                      return entry;
                    });
                    updateImportedFitData(newFitData);
                    updateFitQuantityMultiplier(Math.round(e.target.value));
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography>{importedFitName}</Typography>
              </Grid>
            </Grid>
          )}
          <Grid container item sx={{ overflow: "auto" }}>
            {importedFitData.map((item, index) => {
              return (
                <FittingImportRow
                  key={uuid()}
                  item={item}
                  index={index}
                  updateImportedFitData={updateImportedFitData}
                />
              );
            })}
          </Grid>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AddShipFittingPanel;
