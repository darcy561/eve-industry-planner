import { Button, Tooltip } from "@mui/material";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";
import { useSaveAndLeave } from "./Edit Job Hooks/saveOpenJob";
import { useJobModified } from "./Edit Job Hooks/useJobDraft";

/** Saves the open job and leaves it, filled when there is something to save and quiet when not. */
export function SaveJobButton() {
  const persist = useActiveJobPersistGate();
  const saveAndLeave = useSaveAndLeave();
  const modified = useJobModified();

  const saveBlockedReason = persistAffordanceBlockedReason({
    readOnly: persist.readOnly,
    jobLockHeld: persist.jobLockHeld,
    action: "save is disabled",
  });

  return (
    <Tooltip title={saveBlockedReason} arrow placement="bottom">
      <span>
        <Button
          size="small"
          variant={modified ? "contained" : "outlined"}
          disabled={!persist.canPersist}
          onClick={async () => {
            if (!persist.canPersist) return;
            await saveAndLeave();
          }}
        >
          Save &amp; close
        </Button>
      </span>
    </Tooltip>
  );
}
