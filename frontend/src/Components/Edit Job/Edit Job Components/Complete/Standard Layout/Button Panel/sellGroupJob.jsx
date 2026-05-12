import { Button, Tooltip } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";

export function SellGroupJobButton({ state, actions }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const jobLockReadOnly = useActiveJobReadOnly(state);

  const toggleMarkForSell = () => {
    if (jobLockReadOnly) return;
    if (!state.activeJob.isReadyToSell) {
      state.activeJob.jobStatus += 1;
    }
    state.activeJob.toggleGroupJobReadyForSale();
    actions.updateActiveJob(state.activeJob);
  };

  if (!activeGroupID || state.activeJob.parentJobs.length !== 0) {
    return null;
  }

  const tooltipTitle = jobLockReadOnly
    ? lockReasonText({ action: "sale state is disabled" })
    : "Sell";

  return (
    <Tooltip title={tooltipTitle} arrow placement="bottom">
      <span>
        <Button
          color="primary"
          variant="contained"
          size="small"
          onClick={toggleMarkForSell}
          sx={{ margin: 1 }}
          disabled={jobLockReadOnly || state.activeJob.isReadyToSell}
        >
          {state.activeJob.isReadyToSell
            ? "Not Ready For Sale"
            : "Ready For Sale"}
        </Button>
      </span>
    </Tooltip>
  );
}
