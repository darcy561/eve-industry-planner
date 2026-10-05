import { Alert, AlertTitle, Button } from "@mui/material";
import useUsersStore from "../../Zustand/usersStore";
import { heldFor } from "./Edit Job Hooks/jobDraftStore";
import { useJobDraft } from "./Edit Job Hooks/useJobDraft";
import { openChangeReview } from "../../Events/changeReviewEvents";

/**
 * @param {{draft: object, activeJobID: string|null}} editSession
 * @param {"conflict"|"gone"} outcome
 * @returns {number} The open job's held changes with that outcome, counting a group once
 */
function countHeldLeaders({ draft, activeJobID }, outcome) {
  return heldFor(draft, activeJobID).filter(
    (entry) => entry.follows === undefined && entry.outcome === outcome,
  ).length;
}

/**
 * Says an incoming save has set some of the reader's changes aside, and offers the review; it never
 * opens the review itself.
 */
export default function IncomingSaveNotice() {
  const toChoose = useUsersStore((store) =>
    countHeldLeaders(store.editSession, "conflict"),
  );
  const gone = useUsersStore((store) =>
    countHeldLeaders(store.editSession, "gone"),
  );
  const jobName = useJobDraft((job) => job.name);
  if (toChoose + gone === 0) return null;

  const asked = [
    toChoose > 0 &&
      `${toChoose === 1 ? "one" : toChoose} of your changes ${toChoose === 1 ? "needs" : "need"} you to choose`,
    gone > 0 && `${gone === 1 ? "one" : gone} can't be applied`,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <Alert
      severity="warning"
      sx={{ mb: 1 }}
      action={
        <Button
          color="inherit"
          variant="outlined"
          onClick={() => openChangeReview()}
        >
          Review changes
        </Button>
      }
    >
      <AlertTitle>{`An incoming save changed ${jobName ?? "this job"} while you had it open`}</AlertTitle>
      {`Your version is still on screen. Fields you didn't touch now show the incoming save; ${asked}.`}
    </Alert>
  );
}
