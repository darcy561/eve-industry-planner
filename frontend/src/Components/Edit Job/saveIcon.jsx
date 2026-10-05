import { IconButton, Tooltip } from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { persistAffordanceBlockedReason } from "../DocumentLock/LockGatedTooltip";
import { useSaveAndLeave } from "./Edit Job Hooks/useSaveAndLeave";

export function SaveJobIcon() {
  const persist = useActiveJobPersistGate();
  const saveAndLeave = useSaveAndLeave();

  async function onClick() {
    if (!persist.canPersist) return;
    await saveAndLeave();
  }
  const saveBlockedReason = persistAffordanceBlockedReason({
    readOnly: persist.readOnly,
    jobLockHeld: persist.jobLockHeld,
    action: "save is disabled",
  });

  return (
    <Tooltip
      title={
        saveBlockedReason ||
        "Saves all changes and returns to the job planner page."
      }
      arrow
      placement="bottom"
    >
      <span>
        <IconButton
          color="primary"
          size="medium"
          onClick={onClick}
          disabled={!persist.canPersist}
          aria-label="Save and return to the job planner"
        >
          <SaveIcon />
        </IconButton>
      </span>
    </Tooltip>
  );
}
