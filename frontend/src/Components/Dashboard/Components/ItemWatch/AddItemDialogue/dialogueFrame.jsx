import { totalQuantityProduced } from "../../../../Edit Job/Edit Job Hooks/jobSelectors";
import { Button, Grid } from "@mui/material";
import ContentDialogue from "../../../../../Styled Components/Dialogue/ContentDialogue";
import { useState } from "react";
import { putWatchlistDeprecatedToApi } from "../../../../../Functions/Endpoints/Private/watchlistDeprecated.js";
import { AppEvent } from "../../../../../analytics/appEventNames";
import { trackAppEvent } from "../../../../../analytics/trackAppEvent";
import { ImportNewJob_WatchlistDialogue } from "./importNewJob";
import { FailedImport_WatchlistDialogue } from "./failedImport";
import { LoadingDisplay_WatchlistDialogue } from "./loadingDisplay";
import { EditItemDisplay_WatchlistDialogue } from "./mainDisplay";
import { showSnackbarSuccess } from "../../../../../Events/snackbarEvents";
import useUsersStore from "../../../../../Zustand/usersStore";

/**
 * Adds a watchlist item, or edits the one at `watchlistItemToEdit`. Mounted only
 * while it is open, so everything it works out along the way goes when it shuts.
 *
 * @param {Object} props
 * @param {number|null} props.watchlistItemToEdit - Index of the item being edited
 * @param {Function} props.onClose
 */
export function AddWatchItemDialogue({ watchlistItemToEdit, onClose }) {
  const { userWatchlist } = useUsersStore((state) => state.jobData);
  const { setUserWatchlistItems } = useUsersStore.getState().jobData.actions;
  const [loadingState, changeLoadingState] = useState(false);
  const [loadingText, changeLoadingText] = useState(null);
  const [failedImport, setFailedImport] = useState(false);
  const [watchlistItemRequest, updateWatchlistItemRequest] = useState(null);
  const [materialJobs, setMaterialJobs] = useState(null);
  const [saveReady, updateSaveReady] = useState(false);
  const [groupSelect, updateGroupSelect] = useState(0);

  /* Everything this dialogue works out is local state, and it is unmounted on
   * close, so there is nothing to put back. */
  const handleClose = onClose;

  async function handleSave() {
    let newUserWatchlistItems = [...userWatchlist.items];
    let mainJobMaterials = [];
    let childJobPresent = false;
    Object.values(materialJobs[watchlistItemRequest].build.materials).forEach(
      (mat) => {
        const job = materialJobs[mat.typeID];

        mainJobMaterials.push({
          id: crypto.randomUUID(),
          typeID: mat.typeID,
          name: mat.name,
          quantity: mat.quantity,
          quantityProduced: job !== undefined ? totalQuantityProduced(job) : 0,
          materials: [],
          group: groupSelect,
          buildData:
            job !== undefined
              ? Object.values(job?.build?.setup)[0].toDocument()
              : null,
        });
      },
    );
    mainJobMaterials.forEach((mat) => {
      let job = materialJobs[mat.typeID];

      if (!job) return;
      Object.values(job.build.materials).forEach((item) => {
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
      quantity: totalQuantityProduced(materialJobs[watchlistItemRequest]),
      materials: mainJobMaterials,
      childJobPresent: childJobPresent,
      buildData: Object.values(
        materialJobs[watchlistItemRequest].build.setup,
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
    await putWatchlistDeprecatedToApi(
      userWatchlist.groups,
      newUserWatchlistItems,
    );
    trackAppEvent(AppEvent.NEW_WATCHLIST_ITEM);

    showSnackbarSuccess(`${materialJobs[watchlistItemRequest].name} Added`, 3);
    handleClose();
  }

  return (
    <ContentDialogue
      open
      onClose={handleClose}
      title="Watchlist Item"
      componentName="AddWatchItemDialogue"
      useAppShellDesign
      actions={
        <>
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
        </>
      }
    >
      <Grid container>
        <DialogueDisplayLogic
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
    </ContentDialogue>
  );
}

function DialogueDisplayLogic({
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
    return <FailedImport_WatchlistDialogue />;
  }
  if (loadingState) {
    return <LoadingDisplay_WatchlistDialogue loadingText={loadingText} />;
  }
  if (!materialJobs) {
    return (
      <ImportNewJob_WatchlistDialogue
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
    <EditItemDisplay_WatchlistDialogue
      watchlistItemRequest={watchlistItemRequest}
      materialJobs={materialJobs}
      setMaterialJobs={setMaterialJobs}
      groupSelect={groupSelect}
      updateGroupSelect={updateGroupSelect}
    />
  );
}
