import { Button } from "@mui/material";
import { trackNewJobsCreated } from "../../../../../../../analytics/trackNewJobsCreated";
import useUsersStore from "../../../../../../../Zustand/usersStore";

export function CancelCreateChildJobButton_ChildJobPopoverFrame({
  state,
  actions,
  material,
}) {
  return (
    <Button
      size="small"
      onClick={() => {
        actions.markChildJobsForRemoval(
          state.temporaryChildJobs[material.typeID]
        );
      }}
    >
      Cancel Creation
    </Button>
  );
}
export function CreateChildJobButton_ChildJobPopoverFrame({
  actions,
  childJobObjects,
  tempPrices,
  material,
}) {
  return (
    <Button
      size="small"
      onClick={() => {
        const job = childJobObjects.find((j) => j.itemID === material.typeID);
        if (!job) {
          return;
        }
        actions.markChildJobsForAddition(job);
        trackNewJobsCreated(job);
        useUsersStore.getState().worldData.actions.addMarketData(tempPrices);
      }}
    >
      Mark For Creation
    </Button>
  );
}
