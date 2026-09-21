import { Button, Tooltip } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import { toggleReadyForSaleFromGroup } from "../../../../Edit Job Hooks/jobCommands";
import {
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";

export function SellGroupJobButton() {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const hasParents = useJobDraft((job) => job.parentJobs.length > 0);
  const isReadyToSell = useJobDraft((job) => job.isReadyToSell);
  const actions = useJobActions();
  const jobLockReadOnly = useActiveJobReadOnly();

  const toggleMarkForSell = () => {
    if (jobLockReadOnly) return;
    actions.run(toggleReadyForSaleFromGroup());
  };

  if (!activeGroupID || hasParents) {
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
          disabled={jobLockReadOnly || isReadyToSell}
        >
          {isReadyToSell ? "Not Ready For Sale" : "Ready For Sale"}
        </Button>
      </span>
    </Tooltip>
  );
}
