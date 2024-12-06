import { useContext, useState } from "react";
import {
  ApplicationSettingsContext,
  PriceEntryListContext,
  UserLoginUIContext,
} from "../../../Context/LayoutContext";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { JobArrayContext } from "../../../Context/JobContext";
import {
  FirebaseListenersContext,
  IsLoggedInContext,
  UserJobSnapshotContext,
} from "../../../Context/AuthContext";
import { listingType } from "../../../Context/defaultValues";
import { ItemPriceRow } from "./itemRow";
import GLOBAL_CONFIG from "../../../global-config-app";
import { useHelperFunction } from "../../../Hooks/GeneralHooks/useHelperFunctions";
import {
  useAddMaterialCostsToJob,
  useBuildMaterialPriceObject,
} from "../../../Hooks/JobHooks/useAddMaterialCosts";
import updateJobInFirebase from "../../../Functions/Firebase/updateJob";
import uploadJobSnapshotsToFirebase from "../../../Functions/Firebase/uploadJobSnapshots";
import findOrGetJobObject from "../../../Functions/Helper/findJobObject";
import manageListenerRequests from "../../../Functions/Firebase/manageListenerRequests";

export function PriceEntryDialog() {
  const { jobArray, updateJobArray } = useContext(JobArrayContext);
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { userJobSnapshot, updateUserJobSnapshot } = useContext(
    UserJobSnapshotContext
  );
  const { userDataFetch } = useContext(UserLoginUIContext);
  const { applicationSettings } = useContext(ApplicationSettingsContext);
  const { firebaseListeners, updateFirebaseListeners } = useContext(
    FirebaseListenersContext
  );
  const {
    importMultibuyFromClipboard,
    sendSnackbarNotificationSuccess,
    sendSnackbarNotificationError,
  } = useHelperFunction();

  const { priceEntryListData, updatePriceEntryListData } = useContext(
    PriceEntryListContext
  );
  const [importAction, changeImportAction] = useState(false);
  const [displayOrder, changeDisplayOrder] = useState(
    !priceEntryListData.displayOrder
      ? applicationSettings.defaultOrders
      : priceEntryListData.displayOrder
  );
  const [displayMarket, changeDisplayMarket] = useState(
    !priceEntryListData.displayMarket
      ? applicationSettings.defaultMarket
      : priceEntryListData.displayMarket
  );
  const [totalImportedCost, updateTotalImportedCost] = useState(0);
  const [totalConfirmed, updateTotalConfirmed] = useState(false);
  const [importFromClipboard, updateImportFromClipboard] = useState(false);
  const { MARKET_OPTIONS } = GLOBAL_CONFIG;

  const handleClose = () => {
    updateTotalImportedCost(0);
    updatePriceEntryListData((prev) => ({
      ...prev,
      open: false,
      list: [],
      displayMarket: null,
      displayOrder: null,
    }));
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    changeImportAction(true);
    let newUserJobSnapshot = [...userJobSnapshot];
    const retrievedJobs = [];
    const priceObjectArray = [];
    let jobsToAddPricesInto = new Set();
    let totalConfirmed = 0;

    for (let material of priceEntryListData.list) {
      if (!material.confirmed) continue;
      priceObjectArray.push(
        useBuildMaterialPriceObject(
          material.typeID,
          "allRemaining",
          material.itemPrice
        )
      );
      totalConfirmed++;
      for (let ref of material.jobRef) {
        jobsToAddPricesInto.add(ref);
      }
    }

    jobsToAddPricesInto = [...jobsToAddPricesInto];

    for (let inputJobID of jobsToAddPricesInto) {
      let job = await findOrGetJobObject(inputJobID, jobArray, retrievedJobs);
      if (!job) continue;

      const { newMaterialArray, newTotalPurchaseCost } =
        useAddMaterialCostsToJob(job, priceObjectArray);
      job.build.materials = newMaterialArray;
      job.build.costs.totalPurchaseCost = newTotalPurchaseCost;

      const matchedSnapshot = newUserJobSnapshot.find(
        (i) => i.jobID === job.jobID
      );
      if (matchedSnapshot) {
        matchedSnapshot.setSnapshot(job);
      }
      
      if (isLoggedIn) {
        await updateJobInFirebase(job);
      }
    }

    if (isLoggedIn) {
      await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
    }
    manageListenerRequests(
      retrievedJobs,
      updateJobArray,
      updateFirebaseListeners,
      firebaseListeners,
      isLoggedIn
    );
    updateUserJobSnapshot(newUserJobSnapshot);
    updateJobArray((prev) => {
      const existingIDs = new Set(prev.map(({ jobID }) => jobID));
      return [
        ...prev,
        ...retrievedJobs.filter(({ jobID }) => !existingIDs.has(jobID)),
      ];
    });
    changeImportAction(false);
    updatePriceEntryListData((prev) => ({
      ...prev,
      open: false,
      list: [],
      displayMarket: null,
      displayOrder: null,
    }));

    updateTotalImportedCost(0);
    updateTotalConfirmed(false);
    sendSnackbarNotificationSuccess(
      `${totalConfirmed} Item Costs Added Into ${jobsToAddPricesInto.length} ${
        jobsToAddPricesInto.length > 1 ? "Jobs" : "Job"
      }`,
      3
    );
  };

  return (
    <Dialog
      open={priceEntryListData.open}
      onClose={handleClose}
      sx={{ padding: "20px" }}
    >
      <DialogTitle id="PriceEntryListDialog" align="center" color="primary">
        Price Entry
      </DialogTitle>
      {!applicationSettings.hideTutorials && !userDataFetch ? (
        <Grid item xs={12} align="center" sx={{ marginBottom: "20px" }}>
          <Typography variant="caption">
            Use the dropdown options to select imported costs from your chosen
            market hub or enter your own values for the items.{<br />}
            {<br />}
            Use the Import From Clipboard button to import costs copied from the
            MultiBuy window in the Eve client. This can be found in the dropdown
            menu in the top right hand corner of the window.
            {<br />}
            {<br />}
            Once you are happy with the item cost use the checkbox to confirm
            the cost. Only items with confirmed costs will be imported, these
            will satisfy all remaining materials needed.
          </Typography>
        </Grid>
      ) : null}

      <DialogActions>
        <Grid container align="center">
          <Grid item xs={6}>
            <Select
              value={displayMarket}
              variant="standard"
              size="small"
              onChange={(e) => {
                changeDisplayMarket(e.target.value);
                updatePriceEntryListData((prev) => ({
                  ...prev,
                  displayMarket: e.target.value,
                }));
              }}
              sx={{
                width: "90px",
                marginRight: "5px",
              }}
            >
              {MARKET_OPTIONS.map((option) => {
                return (
                  <MenuItem key={option.name} value={option.id}>
                    {option.name}
                  </MenuItem>
                );
              })}
            </Select>
          </Grid>
          <Grid item xs={6}>
            <Select
              value={displayOrder}
              variant="standard"
              size="small"
              onChange={(e) => {
                changeDisplayOrder(e.target.value);
                updatePriceEntryListData((prev) => ({
                  ...prev,
                  displayOrder: e.target.value,
                }));
              }}
              sx={{
                width: "120px",
                marginLeft: "5px",
              }}
            >
              {listingType.map((option) => {
                return (
                  <MenuItem key={option.name} value={option.id}>
                    {option.name}
                  </MenuItem>
                );
              })}
            </Select>
          </Grid>
        </Grid>
      </DialogActions>
      <form onSubmit={handleAdd}>
        <DialogContent>
          <Grid container>
            {priceEntryListData.list.map((item, index) => {
              return (
                <ItemPriceRow
                  key={item.typeID}
                  item={item}
                  index={index}
                  displayOrder={displayOrder}
                  displayMarket={displayMarket}
                  totalImportedCost={totalImportedCost}
                  updateTotalImportedCost={updateTotalImportedCost}
                  importFromClipboard={importFromClipboard}
                  updateImportFromClipboard={updateImportFromClipboard}
                />
              );
            })}
          </Grid>
        </DialogContent>
        <Grid item xs={12} align="center" sx={{ marginTop: "10px" }}>
          <Typography sx={{ typography: { xs: "body2", sm: "body1" } }}>
            Confirmed Cost Total
          </Typography>
          <Typography sx={{ typography: { xs: "body2", sm: "body1" } }}>
            {totalImportedCost.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Typography>
        </Grid>
        <Grid item xs={12} align="center" sx={{ marginTop: "10px" }}>
          {!totalConfirmed ? (
            <Button
              onClick={() => {
                let newList = [...priceEntryListData.list];
                let newTotal = totalImportedCost;
                newList.forEach((item) => {
                  if (item.itemPrice > 0) {
                    if (!item.confirmed) {
                      newTotal += item.itemPrice * item.quantity;
                    }
                    item.confirmed = true;
                  }
                });
                updateTotalConfirmed((prev) => !prev);
                updateTotalImportedCost(newTotal);
                updatePriceEntryListData((prev) => ({
                  ...prev,
                  list: newList,
                }));
              }}
            >
              Confirm All
            </Button>
          ) : (
            <Button
              onClick={() => {
                let newList = [...priceEntryListData.list];
                newList.forEach((item) => {
                  item.confirmed = false;
                });
                updateTotalConfirmed((prev) => !prev);
                updateTotalImportedCost(0);
                updatePriceEntryListData((prev) => ({
                  ...prev,
                  list: newList,
                }));
              }}
            >
              Unconfirm All
            </Button>
          )}
        </Grid>

        <DialogActions sx={{ padding: "20px" }}>
          {!importAction ? (
            <>
              <Button
                onClick={async () => {
                  let newList = [...priceEntryListData.list];
                  let newTotal = totalImportedCost;
                  let importCount = 0;
                  let importStatus = false;
                  let matches = await importMultibuyFromClipboard();

                  for (let listItem of newList) {
                    const importMatch = matches.find(
                      (i) => i.importedName === listItem.name
                    );
                    if (!importMatch) continue;

                    newTotal += importMatch.importedCost * listItem.quantity;
                    listItem.confirmed = true;
                    listItem.itemPrice = importMatch.importedCost;
                    importCount++;
                  }

                  if (importCount > 0) {
                    importStatus = true;
                  }

                  updateTotalImportedCost(newTotal);
                  updatePriceEntryListData((prev) => ({
                    ...prev,
                    list: newList,
                  }));
                  updateImportFromClipboard(true);
                  if (importStatus) {
                    sendSnackbarNotificationSuccess(
                      `${importCount} Prices Added`,
                      3
                    );
                  } else {
                    sendSnackbarNotificationError("No Matching Items Found", 3);
                  }
                }}
              >
                Import Costs From MultiBuy
              </Button>
              <Button
                variant="contained"
                sx={{ marginRight: "20px" }}
                type="submit"
              >
                Add Prices
              </Button>
            </>
          ) : (
            <CircularProgress size="small" color="primary" />
          )}

          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
