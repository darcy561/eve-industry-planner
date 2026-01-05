import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Grid,
} from "@mui/material";
import { useState } from "react";
import { useFirebase } from "../../../../../Hooks/useFirebase";
import { getAnalytics, logEvent } from "firebase/analytics";
import { ImportNewJob_WatchlistDialog } from "./importNewJob.";
import { FailedImport_WatchlistDialog } from "./failedImport";
import { LoadingDisplay_WatchlistDialog } from "./loadingDisplay";
import { EditItemDisplay_WatchlistDialog } from "./mainDisplay";
import uuid from "react-uuid";
import { showSnackbarSuccess } from "../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../Zustand/usersStore";

export function AddWatchItemDialog({
  openDialog,
  setOpenDialog,
  watchlistItemToEdit,
  updateWatchlistItemToEdit,
}) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const { setUserWatchlistItems } = useUsersStore.getState().jobData.actions;
  const { uploadUserWatchlist } = useFirebase();
  const [loadingState, changeLoadingState] = useState(false);
  const [loadingText, changeLoadingText] = useState(null);
  const [failedImport, setFailedImport] = useState(false);
  const [watchlistItemRequest, updateWatchlistItemRequest] = useState(null);
  const [materialJobs, setMaterialJobs] = useState(null);
  const [saveReady, updateSaveReady] = useState(false);
  const [groupSelect, updateGroupSelect] = useState(0);
  const analytics = getAnalytics();

  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  const handleClose = () => {
    setOpenDialog(false);
    changeLoadingState(false);
    setFailedImport(false);
    setMaterialJobs(null);
    updateSaveReady(false);
    updateGroupSelect(0);
    updateWatchlistItemToEdit(null);
  };

  async function handleSave() {
    let newUserWatchlistItems = [...userWatchlist.items];
    let mainJobMaterials = [];
    let childJobPresent = false;
    materialJobs[watchlistItemRequest].build.materials.forEach((mat) => {
      const job = materialJobs[mat.typeID];

      mainJobMaterials.push({
        id: uuid(),
        typeID: mat.typeID,
        name: mat.name,
        quantity: mat.quantity,
        quantityProduced:
          job !== undefined ? job.build.products.totalQuantity : 0,
        materials: [],
        group: groupSelect,
        buildData:
          job !== undefined
            ? Object.values(job?.build?.setup)[0].toDocument()
            : null,
      });
    });
    mainJobMaterials.forEach((mat) => {
      let job = materialJobs[mat.typeID];

      if (!job) return;
      job.build.materials.forEach((item) => {
        mat.materials.push({
          id: job.jobID,
          typeID: item.typeID,
          name: item.name,
          quantity: item.quantity,
        });
      });
      childJobPresent = true;
    });

    const finalWatchlistItem = {
      id: Date.now(),
      typeID: watchlistItemRequest,
      group: groupSelect,
      name: materialJobs[watchlistItemRequest].name,
      quantity: materialJobs[watchlistItemRequest].build.products.totalQuantity,
      materials: mainJobMaterials,
      childJobPresent: childJobPresent,
      buildData: Object.values(
        materialJobs[watchlistItemRequest].build.setup
      )[0].toDocument(),
    };
    if (watchlistItemToEdit) {
      newUserWatchlistItems[watchlistItemToEdit] = finalWatchlistItem;
    } else {
      newUserWatchlistItems.push(finalWatchlistItem);

      newUserWatchlistItems.sort((a, b) => {
        if (a.name < b.name) {
          return -1;
        }
        if (a.name > b.name) {
          return 1;
        }
        return 0;
      });
    }

    setUserWatchlistItems(newUserWatchlistItems);
    uploadUserWatchlist(userWatchlist.groups, newUserWatchlistItems);
    logEvent(analytics, "New Watchlist Item", {
      UID: parentUser.accountID,
    });

    showSnackbarSuccess(`${materialJobs[watchlistItemRequest].name} Added`, 3);
    handleClose();
  }

  return (
    <Dialog open={openDialog} onClose={handleClose} sx={{ padding: "20px" }}>
      <DialogContent>
        <Grid container>
          <DialogDisplayLogic
            parentUser={parentUser}
            loadingState={loadingState}
            changeLoadingState={changeLoadingState}
            loadingText={loadingText}
            changeLoadingText={changeLoadingText}
            failedImport={failedImport}
            setFailedImport={setFailedImport}
            watchlistItemRequest={watchlistItemRequest}
            updateWatchlistItemRequest={updateWatchlistItemRequest}
            materialJobs={materialJobs}
            setMaterialJobs={setMaterialJobs}
            updateSaveReady={updateSaveReady}
            groupSelect={groupSelect}
            updateGroupSelect={updateGroupSelect}
            watchlistItemToEdit={watchlistItemToEdit}
          />
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" size="small" onClick={handleClose}>
          Close
        </Button>
        <Button
          disabled={!saveReady}
          variant="contained"
          size="small"
          onClick={handleSave}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DialogDisplayLogic({
  parentUser,
  loadingState,
  changeLoadingState,
  loadingText,
  changeLoadingText,
  failedImport,
  setFailedImport,
  watchlistItemRequest,
  updateWatchlistItemRequest,
  materialJobs,
  setMaterialJobs,
  updateSaveReady,
  groupSelect,
  updateGroupSelect,
  watchlistItemToEdit,
}) {
  if (failedImport) {
    return <FailedImport_WatchlistDialog />;
  }
  if (loadingState) {
    return <LoadingDisplay_WatchlistDialog loadingText={loadingText} />;
  }
  if (!materialJobs) {
    return (
      <ImportNewJob_WatchlistDialog
        parentUser={parentUser}
        setFailedImport={setFailedImport}
        changeLoadingText={changeLoadingText}
        setMaterialJobs={setMaterialJobs}
        updateSaveReady={updateSaveReady}
        changeLoadingState={changeLoadingState}
        updateWatchlistItemRequest={updateWatchlistItemRequest}
        watchlistItemToEdit={watchlistItemToEdit}
        updateGroupSelect={updateGroupSelect}
      />
    );
  }
  return (
    <EditItemDisplay_WatchlistDialog
      parentUser={parentUser}
      watchlistItemRequest={watchlistItemRequest}
      materialJobs={materialJobs}
      setMaterialJobs={setMaterialJobs}
      groupSelect={groupSelect}
      updateGroupSelect={updateGroupSelect}
    />
  );
}
