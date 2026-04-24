import { Button, Tooltip } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function SellGroupJobButton({ state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  
  const toggleMarkForSell = () => {
    if (!state.activeJob.isReadyToSell) {
      state.activeJob.jobStatus += 1;
    }
    state.activeJob.toggleGroupJobReadyForSale();
    actions.updateActiveJob(state.activeJob);
  };

  if (!activeGroupID || state.activeJob.parentJobs.length !== 0) {
    return null;
  }

  return (
    <Tooltip title="Sell" arrow placement="bottom">
      <Button
        color="primary"
        variant="contained"
        size="small"
        onClick={toggleMarkForSell}
        sx={{ margin: 1 }}
        disabled={state.activeJob.isReadyToSell}
      >
        {state.activeJob.isReadyToSell
          ? "Not Ready For Sale"
          : "Ready For Sale"}
      </Button>
    </Tooltip>
  );
}
