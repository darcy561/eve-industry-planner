import {
  Box,
  Button,
  TextField,
  Typography,
  IconButton,
  Divider,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import FittingImportRow from "./fittingRow";
import CloseIcon from "@mui/icons-material/Close";
import { showSnackbarError } from "../../../../Events/snackbarEvents";
import { requestClipboardPermissions } from "../../../../Functions/Clipboard/clipboardPermissions";
import useUsersStore from "../../../../Zustand/usersStore";
import {
  convertImportedItemsToBuildRequests,
  importFromClipboard,
} from "../../../../Functions/JobPlanner/importFitFromClipboard";

function AddShipFittingPanel({ updateItemIDsToAdd, addNewGroupOnBuild }) {
  const [clipboardReadAllowed, updateClipboardReadAllowed] = useState(true);
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const [importedFitData, updateImportedFitData] = useState([]);
  const [importedFitName, updateImportedFitName] = useState("");
  const [fitQuantityMultiplier, updateFitQuantityMultiplier] = useState(1);

  async function importClipboardItems() {
    // Check and request permissions if needed
    let hasPermission = clipboardReadAllowed;
    if (!hasPermission) {
      hasPermission = await requestClipboardPermissions();
      updateClipboardReadAllowed(hasPermission);
      if (!hasPermission) {
        showSnackbarError(
          "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
          3
        );
        return;
      }
    }

    try {
      const { importedItems, fittingName } = await importFromClipboard();

      if (importedItems.length < 1) {
        showSnackbarError("No Fitting Found On Clipboard", 3);
        return;
      }

      updateImportedFitData(importedItems);
      updateImportedFitName(fittingName);
    } catch (error) {
      // Handle clipboard permission errors gracefully
      if (error.message && error.message.includes("Clipboard access denied")) {
        updateClipboardReadAllowed(false);
        showSnackbarError(
          "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
          3
        );
        return;
      }
      console.error("Failed to import from clipboard:", error);
      showSnackbarError(error.message || "Failed to import from clipboard");
    }
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
            groupID: activeGroupID,
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
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Divider />
        <Box
          sx={{
            p: 2,
            textAlign: "center",
            pt: 3,
          }}
        >
          <Tooltip
            title={
              !clipboardReadAllowed
                ? "Clipboard access denied. Click to request permissions."
                : ""
            }
            arrow
          >
            <Button
              size="small"
              variant="contained"
              onClick={importClipboardItems}
              sx={{
                minWidth: "auto",
                py: 0.25,
                px: 0.5,
                fontSize: "0.75rem",
                height: "24px",
              }}
            >
              {importedFitData.length > 0
                ? "Import Another Fit"
                : "Import Fit From Clipboard"}
            </Button>
          </Tooltip>
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: importedFitData.length > 0 ? 3 : 5,
          minHeight: 0,
          height: "100%",
        }}
      >
        {importedFitData.length > 0 && (
          <>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: 1,
                flexShrink: 0,
              }}
            >
              <Button
                size="small"
                onClick={addToBuildQueue}
                sx={{ minWidth: "auto" }}
              >
                Add To Build List
              </Button>
              <TextField
                disabled={importedFitData.length === 0 || !clipboardReadAllowed}
                fullWidth
                size="small"
                sx={{
                  maxWidth: "100px",
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                    {
                      display: "none",
                    },
                }}
                variant="standard"
                helperText="Fit Quantity"
                type="number"
                value={fitQuantityMultiplier}
                onChange={(e) => {
                  const newFitData = importedFitData.map((entry) => {
                    entry.itemCalculatedQty =
                      entry.itemBaseQty * Math.round(e.target.value);
                    return entry;
                  });
                  updateImportedFitData(newFitData);
                  updateFitQuantityMultiplier(Math.round(e.target.value));
                }}
                slotProps={{
                  input: { inputProps: { step: "1", min: 1 } },
                }}
              />
              <IconButton
                size="small"
                onClick={() => {
                  updateImportedFitData([]);
                  updateImportedFitName("");
                  updateFitQuantityMultiplier(1);
                }}
                sx={{
                  p: 0.5,
                  "&:hover": {
                    backgroundColor: "action.hover",
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <Typography variant="subtitle2" align="center" sx={{ mb: 1 }}>
                {importedFitName}
              </Typography>
              <Box sx={{ px: 1 }}>
                {importedFitData.map((item, index) => (
                  <FittingImportRow
                    key={index}
                    item={item}
                    index={index}
                    updateImportedFitData={updateImportedFitData}
                  />
                ))}
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

export default AddShipFittingPanel;
