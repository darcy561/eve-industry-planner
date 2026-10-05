import { useEffect, useRef } from "react";
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import ContentDialogue from "../../../Styled Components/Dialogue/ContentDialogue";
import { useDialogueEventState } from "../../../Styled Components/Dialogue/useDialogueEventState";
import {
  MERGE_DIALOGUE_MODE,
  MERGE_JOBS_EVENT,
} from "../../../Events/mergeJobsEvents";
import {
  JOB_MOVED,
  JOB_MOVED_LABELS,
} from "../../../Functions/Job/changes/jobChange";

const DISCARD_LABELS = [
  ["purchases", "purchase", "purchases"],
  ["extraCosts", "extra cost", "extra costs"],
  ["inventionEntries", "invention entry", "invention entries"],
  ["industryJobs", "linked industry job", "linked industry jobs"],
  ["marketOrders", "linked market order", "linked market orders"],
  ["transactions", "linked transaction", "linked transactions"],
];

/**
 * @param {import("../../../Functions/Job/changes/mergeJobs.js").MergeDiscard} discard
 * @returns {string}
 */
function discardSummary(discard) {
  return DISCARD_LABELS.filter(([key]) => discard[key] > 0)
    .map(
      ([key, one, many]) =>
        `${discard[key]} ${discard[key] === 1 ? one : many}`,
    )
    .join(" · ");
}

/**
 * Confirms what a merge discards before it runs, and says which jobs stopped a refused merge.
 */
export default function MergeJobsDialogue() {
  const [merge, , reset] = useDialogueEventState(MERGE_JOBS_EVENT, () => ({
    isOpen: false,
    mode: MERGE_DIALOGUE_MODE.CONFIRM,
    discards: [],
    moved: [],
  }));
  if (!merge.isOpen) return null;
  return <OpenMergeJobs merge={merge} onClose={reset} />;
}

/**
 * @param {object} props
 * @param {{mode: string, discards: Array<object>, moved: Array<object>, answer?: (merge: boolean) => void, mergeAgain?: () => Promise<unknown>}} props.merge
 * @param {() => void} props.onClose
 */
function OpenMergeJobs({ merge, onClose }) {
  const answered = useRef(false);
  const confirming = merge.mode === MERGE_DIALOGUE_MODE.CONFIRM;
  const held = merge.moved.some((row) => row.reason === JOB_MOVED.HELD);

  useEffect(
    () => () => {
      if (!answered.current) merge.answer?.(false);
    },
    [merge],
  );

  function close(chose) {
    if (!answered.current) {
      answered.current = true;
      merge.answer?.(chose);
    }
    onClose();
  }

  function mergeAgain() {
    onClose();
    void merge.mergeAgain?.();
  }

  return (
    <ContentDialogue
      open
      onClose={() => close(false)}
      title={
        confirming
          ? "Merging discards what these jobs recorded"
          : "Nothing was merged"
      }
      componentName="MergeJobsDialogue"
      maxWidth="sm"
      fullWidth
      helperArea={
        <Typography variant="body2" color="text.secondary" sx={{ px: 3 }}>
          {confirming
            ? "The merged job starts without them, and they cannot be brought back."
            : "Some of the jobs changed after you selected them. Merging again uses the jobs as they are now."}
        </Typography>
      }
      actions={
        <Stack
          direction="row"
          spacing={1}
          sx={{ width: "100%", alignItems: "center" }}
        >
          <Button onClick={() => close(false)}>
            {confirming ? "Cancel" : "Close"}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {!confirming && held && (
            <Typography
              id="merge-again-blocked"
              variant="body2"
              color="warning.main"
            >
              Wait until the jobs open elsewhere are closed
            </Typography>
          )}
          {confirming ? (
            <Button
              variant="contained"
              color="warning"
              onClick={() => close(true)}
            >
              Merge
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={held}
              aria-describedby={held ? "merge-again-blocked" : undefined}
              onClick={mergeAgain}
            >
              Merge again
            </Button>
          )}
        </Stack>
      }
      dialogueActionsProps={{ sx: { px: 3, pb: 2 } }}
    >
      <List dense disablePadding>
        {confirming
          ? merge.discards.map((discard) => (
              <ListItem key={discard.jobID} disableGutters>
                <ListItemText
                  primary={discard.name}
                  secondary={discardSummary(discard)}
                />
              </ListItem>
            ))
          : merge.moved.map((row) => (
              <ListItem key={row.jobID} disableGutters>
                <ListItemText
                  primary={row.name}
                  secondary={JOB_MOVED_LABELS[row.reason]}
                />
              </ListItem>
            ))}
      </List>
    </ContentDialogue>
  );
}
