import { Button } from "@mui/material";
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
        actions.markChildJobsForAddition(
          childJobObjects.find((job) => job.itemID === material.typeID)
        );
        useUsersStore.getState().worldData.actions.addMarketData(tempPrices);
      }}
    >
      Mark For Creation
    </Button>
  );
}
