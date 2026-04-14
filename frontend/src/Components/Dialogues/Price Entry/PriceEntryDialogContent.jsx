import { useEffect, useCallback } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  Typography,
} from "@mui/material";
import { LoadingPage } from "../../loadingPage";
import { ItemPriceRow, itemPriceEntryFactory } from "./itemRow";
import uploadJobSnapshotsToFirebase from "../../../Functions/Firebase/uploadJobSnapshots";
import manageListenerRequests from "../../../Functions/Firebase/manageListenerRequests";
import firebaseBatchUpdateJobs from "../../../Functions/Firebase/batchUpdateJobs";
import MarketLocationSelect from "../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../Styled Components/Select/marketListing";
import {
  showSnackbarSuccess,
  showSnackbarError,
} from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";
import { formatNumberForLocale } from "../../../Functions/Helper/numberParser";
import importMultibuyFromClipboard from "../../../Functions/Clipboard/importMultibuy";
import { requestClipboardPermissions } from "../../../Functions/Clipboard/clipboardPermissions";
import { LARGE_TEXT_FORMAT } from "../../../Context/defaultValues";
import convertJobIDsToObjects from "../../../Functions/Helper/convertJobIDsToObjects";
import {
  distributeItemCostsBetweenJobs,
  buildNotificationText,
} from "../../../Functions/Shared/passBuildCosts";
import seperateGroupAndJobIDs from "../../../Functions/Helper/seperateGroupAndJobIDs";
import retrieveJobIDsFromGroupObjects from "../../../Functions/Helper/getJobIDsFromGroupObjects";

export function PriceEntryDialogContent({ state, actions }) {
  const { userJobSnapshot } = useUsersStore((state) => state.jobData);
  const { updateJobSnapshotsFromJobs, addRetrievedJobsToJobArray } =
    useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const displayHelpCards = useUsersStore(
    (state) => state.applicationSettings.displayHelpCards
  );

  const buildItemPriceEntry = useCallback(
    async (inputJobIDs) => {
      const finalPriceEntry = [];
      const retrievedJobs = [];

      const { groupIDs, jobIDs } = seperateGroupAndJobIDs(inputJobIDs);

      const groupJobIDs = retrieveJobIDsFromGroupObjects(groupIDs);

      const requestedJobObjects = await convertJobIDsToObjects(
        [...jobIDs, ...groupJobIDs],
        retrievedJobs
      );

      for (let inputJob of requestedJobObjects) {
        inputJob.build.materials.forEach((material) => {
          const childJobs = inputJob.build.childJobs[material.typeID];
          if (
            material.quantityPurchased >= material.quantity ||
            childJobs.length > 0
          ) {
            return;
          }

          // Calculate remaining quantity needed by subtracting already purchased quantity
          const remainingQuantity = material.quantity - material.quantityPurchased;
          if (remainingQuantity <= 0) {
            return;
          }

          const existingEntryIndex = finalPriceEntry.findIndex(
            (i) => i.typeID === material.typeID
          );
          if (existingEntryIndex !== -1) {
            finalPriceEntry[existingEntryIndex].totalQuantity += material.quantity;
            finalPriceEntry[existingEntryIndex].remainingQuantity += remainingQuantity;
            finalPriceEntry[existingEntryIndex].jobRef.push(inputJob.jobID);
          } else {
            finalPriceEntry.push({
              name: material.name,
              typeID: material.typeID,
              priceEntries: [],
              totalQuantity: material.quantity,
              remainingQuantity: remainingQuantity,
              jobRef: [inputJob.jobID],
            });
          }
        });
      }

      finalPriceEntry.sort((a, b) => a.name.localeCompare(b.name));
      manageListenerRequests(retrievedJobs);
      addRetrievedJobsToJobArray(retrievedJobs);
      return finalPriceEntry;
    },
    [addRetrievedJobsToJobArray]
  );

  // Build price entry list when requestedJobIDs changes
  useEffect(() => {
    if (!state.isOpen || state.requestedJobIDs.length === 0) return;

    async function buildPriceEntryList() {
      actions.setIsLoading(true);
      const itemPriceEntry = await buildItemPriceEntry(state.requestedJobIDs);
      actions.setPriceEntryList(itemPriceEntry);
      actions.setIsLoading(false);
    }

    buildPriceEntryList();
  }, [state.isOpen, state.requestedJobIDs, buildItemPriceEntry, actions]);

  // Calculate total from confirmed price entries only
  const calculateTotalCost = () => {
    return state.priceEntryList.reduce((total, item) => {
      if (!item.priceEntries) return total;
      return (
        total +
        item.priceEntries.reduce((itemTotal, entry) => {
          return itemTotal + (entry.itemCount || 0) * (entry.itemCost || 0);
        }, 0)
      );
    }, 0);
  };

  const totalImportedCost = calculateTotalCost();

  const handleClose = () => {
    actions.resetState();
  };

  async function handleAdd() {
    actions.setIsLoading(true);
    const jobIDSet = new Set();
    const retrievedJobs = [];
    const collectedMaterials = {};
    const materialIDMap = {};

    for (let item of state.priceEntryList) {
      if (!item.priceEntries || item.priceEntries.length === 0) continue;

      const materialID = item.typeID;

      if (!collectedMaterials[materialID]) {
        collectedMaterials[materialID] = {
          totalQuantity: 0,
          costs: [],
        };
        materialIDMap[materialID] = new Set();
      }

      for (let jobID of item.jobRef) {
        jobIDSet.add(jobID);
        materialIDMap[materialID].add(jobID);
      }

      for (let priceEntry of item.priceEntries) {
        // Allow 0 values - only exclude negative values or null/undefined
        if (
          priceEntry.itemCount != null &&
          priceEntry.itemCount >= 0 &&
          priceEntry.itemCost != null &&
          priceEntry.itemCost >= 0
        ) {
          collectedMaterials[materialID].totalQuantity += priceEntry.itemCount;
          collectedMaterials[materialID].costs.push({
            id: null,
            cost: priceEntry.itemCost,
            quantity: priceEntry.itemCount,
          });
        }
      }
    }

    const jobsToPass = await convertJobIDsToObjects(jobIDSet, retrievedJobs);

    const result = distributeItemCostsBetweenJobs(
      collectedMaterials,
      jobsToPass,
      materialIDMap
    );

    const notificationText = buildNotificationText(
      result.successfulJobImportCount,
      result.priceItemsImportedCount
    );
    if (result.priceItemsImportedCount === 0) {
      showSnackbarError("No valid price entries to add", 3);
      actions.setIsLoading(false);
      return;
    }

    const modifiedJobs = await convertJobIDsToObjects(
      result.modifiedJobIDs,
      retrievedJobs
    );

    if (isLoggedIn) {
      await firebaseBatchUpdateJobs(modifiedJobs);
      await uploadJobSnapshotsToFirebase(userJobSnapshot);
    }

    manageListenerRequests(retrievedJobs);
    updateJobSnapshotsFromJobs(modifiedJobs);
    addRetrievedJobsToJobArray(retrievedJobs);

    showSnackbarSuccess(notificationText, 3);
    actions.setIsLoading(false);
    handleClose();
  }

  const handleUpdatePriceEntryList = (newList) => {
    actions.setPriceEntryList(newList);
  };

  return (
    <Dialog
      open={state.isOpen}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      sx={{
        "& .MuiDialog-paper": {
          maxHeight: "90vh",
          width: { xs: "95vw", sm: "90vw", md: "1200px" },
        },
      }}
    >
      <DialogTitle id="PriceEntryListDialog" align="center" color="primary">
        Price Entry
      </DialogTitle>
      {displayHelpCards ? (
        <Grid
          align="center"
          sx={{ marginBottom: "20px", paddingX: "20px" }}
          size={12}
        >
          <Typography variant="caption">
            Add multiple price entries for each item type, allowing different
            quantities to be purchased at different prices. Multiple entries can
            be used to track purchases made at different prices.
            <br />
            <br />
            When applying costs, the application processes jobs sequentially.
            For each price entry, the specified quantity and cost are applied to
            jobs until either the quantity at that price is exhausted or the job
            no longer requires that material. Any remaining quantity is then
            applied to the next job or the application moves on to the next
            price entry. Price entries do not need to cover the full required
            quantity and can be added in partial amounts.
            <br />
            <br />
            Use the <strong>Import From Clipboard</strong> button to import
            costs copied from the <strong>MultiBuy</strong> window in the EVE
            client, then click <strong>Add Prices</strong> to apply all price
            entries to the selected jobs.
          </Typography>
        </Grid>
      ) : null}
      <DialogContent
        sx={{
          padding: "20px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          minHeight: 0,
          height: "calc(90vh - 200px)",
          maxHeight: "calc(90vh - 200px)",
        }}
      >
        {state.isLoading ? (
          <LoadingPage />
        ) : (
          <Grid
            container
            spacing={2}
            sx={{ flex: 1, overflow: "hidden", minHeight: 0 }}
          >
            {/* Left Column - List */}
            <Grid
              size={{ xs: 12, md: 8 }}
              sx={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                minHeight: 0,
                height: "100%",
              }}
            >
              <Box
                sx={{
                  flex: "1 1 auto",
                  minHeight: 0,
                  maxHeight: "100%",
                  overflowY: "auto",
                  overflowX: "hidden",
                  paddingRight: "10px",
                }}
              >
                <Grid container>
                  {state.priceEntryList.map((item, index) => {
                    return (
                      <ItemPriceRow
                        key={item.typeID}
                        item={item}
                        index={index}
                        displayOrder={state.displayOrder}
                        displayMarket={state.displayMarket}
                        priceEntryListData={{ list: state.priceEntryList }}
                        setPriceEntryListData={(updater) => {
                          if (typeof updater === "function") {
                            const result = updater({
                              list: state.priceEntryList,
                            });
                            handleUpdatePriceEntryList(result.list);
                          } else {
                            handleUpdatePriceEntryList(updater.list);
                          }
                        }}
                        clearUnconfirmedTrigger={state.clearUnconfirmedTrigger}
                      />
                    );
                  })}
                </Grid>
              </Box>
              {/* Confirmed Cost Total - Under the list, not scrollable */}
              <Box
                sx={{
                  flex: "0 0 auto",
                  flexShrink: 0,
                  marginTop: "20px",
                  paddingTop: "20px",
                  borderTop: "1px solid rgba(0,0,0,0.12)",
                }}
              >
                <Grid container sx={{ marginBottom: "10px" }}>
                  <Grid size={4}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      Confirmed Entries Total
                    </Typography>
                  </Grid>
                  <Grid align="right" size={8}>
                    <Typography sx={{ typography: LARGE_TEXT_FORMAT }}>
                      {formatNumberForLocale(totalImportedCost)} ISK
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Grid>
            {/* Right Column - Controls */}
            <Grid
              size={{ xs: 12, md: 4 }}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                paddingLeft: { xs: 0, md: "20px" },
                borderLeft: { xs: "none", md: "1px solid rgba(0,0,0,0.12)" },
                paddingTop: { xs: "20px", md: 0 },
                borderTop: { xs: "1px solid rgba(0,0,0,0.12)", md: "none" },
                minHeight: 0,
              }}
            >
              <Box
                sx={{ display: "flex", flexDirection: "column", gap: "20px" }}
              >
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <MarketLocationSelect
                    value={state.displayMarket}
                    onChange={(e) => {
                      actions.setDisplayMarket(e.id);
                    }}
                    customFormStyling={{
                      width: "100%",
                    }}
                  />
                  <MarketListingSelect
                    value={state.displayOrder}
                    onChange={(e) => {
                      actions.setDisplayOrder(e.id);
                    }}
                    customFormStyling={{
                      width: "100%",
                    }}
                  />
                </Box>
                <Button
                  onClick={() => {
                    let newList = [...state.priceEntryList];
                    newList.forEach((item) => {
                      // Calculate remaining quantity
                      const confirmedQty = (item.priceEntries || []).reduce(
                        (sum, e) => sum + (e.itemCount || 0),
                        0
                      );
                      const remainingQty = item.remainingQuantity - confirmedQty;

                      if (remainingQty > 0) {
                        // Create a new confirmed entry for remaining quantity with default price
                        const materialPrice = useUsersStore
                          .getState()
                          .worldData.actions.findMarketData(item.typeID);
                        const defaultPrice = Number(
                          materialPrice[state.displayMarket][state.displayOrder]
                        );

                        // Only add entry if price is valid (not 0, not NaN, not null/undefined)
                        if (
                          defaultPrice &&
                          defaultPrice > 0 &&
                          !isNaN(defaultPrice)
                        ) {
                          const newEntry = itemPriceEntryFactory(
                            item.typeID,
                            remainingQty,
                            defaultPrice
                          );

                          // Add to confirmed entries
                          if (!item.priceEntries) {
                            item.priceEntries = [];
                          }
                          item.priceEntries.push(newEntry);
                        }
                      }
                    });
                    actions.setPriceEntryList(newList);
                    // Trigger clearing of unconfirmed entries in itemRow components
                    actions.setClearUnconfirmedTrigger(
                      state.clearUnconfirmedTrigger + 1
                    );
                  }}
                  variant="outlined"
                  fullWidth
                >
                  Confirm All
                </Button>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "row", md: "column" },
                  gap: { xs: "10px", md: "20px" },
                  marginTop: { xs: 0, md: "auto" },
                  paddingTop: { xs: 0, md: "20px" },
                  justifyContent: { xs: "space-between", md: "flex-end" },
                  flexShrink: 0,
                }}
              >
                <Button
                  onClick={async () => {
                    // Request permissions on click
                    const hasPermission = await requestClipboardPermissions();
                    if (!hasPermission) {
                      showSnackbarError(
                        "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
                        3
                      );
                      return;
                    }

                      try {
                        let newList = [...state.priceEntryList];
                        let importCount = 0;
                        let importStatus = false;
                        let matches = await importMultibuyFromClipboard();

                        for (let listItem of newList) {
                          const importMatch = matches.find(
                            (i) => i.importedName === listItem.name
                          );
                          if (!importMatch) continue;

                          // Validate imported cost (must be valid and > 0)
                          const importedCost = Number(importMatch.importedCost);
                          if (
                            !importedCost ||
                            importedCost <= 0 ||
                            isNaN(importedCost)
                          ) {
                            continue;
                          }

                          const priorEntries = listItem.priceEntries || [];

                          // Calculate remaining quantity
                          const confirmedQty = priorEntries.reduce(
                            (sum, e) => sum + (e.itemCount || 0),
                            0
                          );
                          const remainingQty = listItem.remainingQuantity - confirmedQty;

                          // Only add if there's remaining quantity to fill
                          if (remainingQty <= 0) continue;

                          // Use imported quantity or remaining quantity, whichever is smaller
                          const importedQuantity =
                            Number(importMatch.importedQuantity) || 0;
                          const quantityToAdd =
                            importedQuantity > 0
                              ? Math.min(importedQuantity, remainingQty)
                              : remainingQty;

                          // Create confirmed entry from clipboard data
                          const newEntry = itemPriceEntryFactory(
                            listItem.typeID,
                            quantityToAdd,
                            importedCost
                          );

                          // New array reference so ItemPriceRow effects see confirmed
                          // changes (same as manual confirm); push() would mutate in place
                          // and leave unconfirmed rows open when remaining hits 0.
                          listItem.priceEntries = [...priorEntries, newEntry];
                          importCount++;
                        }

                        if (importCount > 0) {
                          importStatus = true;
                          actions.setPriceEntryList(newList);
                        }
                        if (importStatus) {
                          showSnackbarSuccess(
                            `${importCount} Price Entries Added`,
                            3
                          );
                        } else {
                          showSnackbarError("No Matching Items Found", 3);
                        }
                      } catch (error) {
                        // Handle clipboard permission errors gracefully
                        if (error.message && error.message.includes("Clipboard access denied")) {
                          showSnackbarError(
                            "Clipboard access denied. Please enable clipboard permissions in your browser settings.",
                            3
                          );
                          return;
                        }
                        console.error(
                          "Failed to import from clipboard:",
                          error
                        );
                        showSnackbarError(
                          error.message || "Failed to import from clipboard"
                        );
                      }
                    }}
                    variant="outlined"
                    fullWidth={false}
                    disabled={state.isLoading}
                    sx={{
                      flex: { xs: 1, md: "none" },
                      fontSize: { xs: "0.75rem", md: "0.875rem" },
                      padding: { xs: "4px 8px", md: "6px 16px" },
                    }}
                  >
                    Import Costs From MultiBuy
                  </Button>
                <Button
                  variant="contained"
                  onClick={handleAdd}
                  fullWidth={false}
                  disabled={state.isLoading}
                  sx={{
                    flex: { xs: 1, md: "none" },
                    fontSize: { xs: "0.75rem", md: "0.875rem" },
                    padding: { xs: "4px 8px", md: "6px 16px" },
                  }}
                >
                  Add Prices
                </Button>
                <Button
                  onClick={handleClose}
                  variant="text"
                  autoFocus
                  sx={{ flex: { xs: 0, md: "none" } }}
                >
                  Close
                </Button>
              </Box>
            </Grid>
          </Grid>
        )}
      </DialogContent>
    </Dialog>
  );
}
