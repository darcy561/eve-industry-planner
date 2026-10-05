import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import ContentDialogue from "../../Styled Components/Dialogue/ContentDialogue";
import { useDialogueEventState } from "../../Styled Components/Dialogue/useDialogueEventState";
import { CHANGE_REVIEW_EVENT } from "../../Events/changeReviewEvents";
import useUsersStore from "../../Zustand/usersStore";
import { reviewOf } from "./Edit Job Hooks/jobDraftStore";
import { useJobDraft } from "./Edit Job Hooks/useJobDraft";
import { useActiveJobPersistGate } from "./Edit Job Hooks/useActiveJobDocumentLock";
import { useSaveAndLeave } from "./Edit Job Hooks/useSaveAndLeave";

/**
 * The reader's changes set out against an incoming save, letting them choose what to keep; it opens
 * when a save is refused or when the reader asks.
 */
export default function ChangeReviewDialogue() {
  const [review, , reset] = useDialogueEventState(CHANGE_REVIEW_EVENT, () => ({
    isOpen: false,
    refused: false,
  }));
  if (!review.isOpen) return null;
  return <OpenChangeReview refused={review.refused} onClose={reset} />;
}

/**
 * @param {*} value
 * @returns {string|null} How a value reads in a row, or null where it is not a single figure
 */
function shownValue(value) {
  if (value === undefined) return "Removed";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  return null;
}

/**
 * @param {Array<*>} values
 * @returns {string|null}
 */
function shownValues(values) {
  const shown = values.map(shownValue).filter((value) => value !== null);
  return shown.length > 0 ? shown.join(", ") : null;
}

/**
 * @param {object} props
 * @param {boolean} props.refused - Whether a save was just refused
 * @param {() => void} props.onClose
 */
function OpenChangeReview({ refused, onClose }) {
  const jobID = useUsersStore((store) => store.editSession.activeJobID);
  const draft = useUsersStore((store) => store.editSession.draft);
  const settle = useUsersStore(
    (store) => store.editSession.actions.settleChangeReview,
  );
  const jobName = useJobDraft((job) => job.name);
  const persist = useActiveJobPersistGate();
  const saveAndLeave = useSaveAndLeave();
  const review = useMemo(() => reviewOf(draft, jobID), [draft, jobID]);
  const [choices, setChoices] = useState({});
  const [letGo, setLetGo] = useState(() => new Set());

  const unanswered = review.choose.filter((row) => !choices[row.seq]).length;

  function settleChoices() {
    settle({
      keep: review.choose
        .filter((row) => choices[row.seq] === "mine")
        .map((row) => row.seq),
      letGo: [...letGo],
    });
  }

  function toggleLetGo(seq) {
    setLetGo((current) => {
      const next = new Set(current);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }

  async function saveAgain() {
    settleChoices();
    onClose();
    await saveAndLeave();
  }

  function apply() {
    settleChoices();
    onClose();
  }

  const blockedReason =
    unanswered > 0
      ? `Choose for ${unanswered === 1 ? "the change above" : `${unanswered} changes`} to ${refused ? "save" : "apply"}`
      : refused && !persist.canPersist
        ? "You no longer hold this job, so it cannot be saved"
        : null;

  return (
    <ContentDialogue
      open
      onClose={onClose}
      title={`An incoming save changed ${jobName ?? "this job"} while you had it open`}
      componentName="ChangeReview"
      maxWidth="sm"
      fullWidth
      helperArea={
        <Stack spacing={1} sx={{ px: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {refused
              ? "Nothing was saved. Your version is still on screen — choose what to keep, then save again."
              : "Your version is still on screen — choose what to keep."}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {review.choose.length > 0 && (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${review.choose.length} to choose`}
              />
            )}
            {review.gone.length > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`${review.gone.length} can't be applied`}
              />
            )}
            {review.applies.length > 0 && (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`${review.applies.length} still ${review.applies.length === 1 ? "applies" : "apply"}`}
              />
            )}
            {review.saved.length > 0 && (
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label={`${review.saved.length} already saved`}
              />
            )}
          </Stack>
        </Stack>
      }
      actions={
        <Stack
          direction="row"
          spacing={1}
          sx={{ width: "100%", alignItems: "center" }}
        >
          <Button onClick={onClose}>Keep editing</Button>
          <Box sx={{ flexGrow: 1 }} />
          {blockedReason && (
            <Typography
              id="change-review-blocked"
              variant="body2"
              color="warning.main"
            >
              {blockedReason}
            </Typography>
          )}
          <Button
            variant="contained"
            disabled={Boolean(blockedReason)}
            aria-describedby={
              blockedReason ? "change-review-blocked" : undefined
            }
            onClick={refused ? saveAgain : apply}
          >
            {refused ? "Save again" : "Apply"}
          </Button>
        </Stack>
      }
      dialogueActionsProps={{ sx: { px: 3, pb: 2 } }}
    >
      <Stack spacing={1.5}>
        {review.choose.map((row) => {
          const mine = shownValues(row.values.map((value) => value.mine));
          const incoming = shownValues(
            row.values.map((value) => value.incoming),
          );
          return (
            <Box
              key={row.seq}
              component="fieldset"
              sx={{
                m: 0,
                p: 2,
                border: 1,
                borderColor: "warning.light",
                borderRadius: 2,
              }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip size="small" color="warning" label="CHOOSE" />
                <Typography component="legend" variant="subtitle2">
                  {row.command}
                </Typography>
              </Stack>
              {row.follows.length > 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {`and ${row.follows.join(", ")}, which ${row.follows.length === 1 ? "goes" : "go"} with it`}
                </Typography>
              )}
              <RadioGroup
                row
                value={choices[row.seq] ?? ""}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [row.seq]: event.target.value,
                  }))
                }
                sx={{ mt: 1, gap: 1 }}
              >
                <FormControlLabel
                  value="mine"
                  control={<Radio />}
                  label={mine ? `Keep mine — ${mine}` : "Keep mine"}
                />
                <FormControlLabel
                  value="incoming"
                  control={<Radio />}
                  label={
                    incoming
                      ? `Take the incoming save — ${incoming}`
                      : "Take the incoming save"
                  }
                />
              </RadioGroup>
            </Box>
          );
        })}
        {review.gone.map((row) => (
          <Box
            key={row.seq}
            sx={{
              p: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "action.hover",
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Chip size="small" label="CAN'T BE APPLIED" />
              <Typography variant="subtitle2">{row.command}</Typography>
            </Stack>
            <Typography variant="body2" sx={{ mt: 1 }}>
              The incoming save removed what this change was made to, so it will
              not be saved.
            </Typography>
          </Box>
        ))}
        {review.applies.map((row) => (
          <Stack
            key={row.seq}
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 2,
              py: 0.5,
              border: 1,
              borderColor: "divider",
              borderStyle: letGo.has(row.seq) ? "dashed" : "solid",
              borderRadius: 2,
            }}
          >
            <Chip
              size="small"
              color={letGo.has(row.seq) ? "default" : "success"}
              label={letGo.has(row.seq) ? "NOT SAVED" : "STILL APPLIES"}
            />
            <Typography
              variant="subtitle2"
              sx={{
                flexGrow: 1,
                textDecoration: letGo.has(row.seq) ? "line-through" : "none",
              }}
            >
              {row.command}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!letGo.has(row.seq)}
                  onChange={() => toggleLetGo(row.seq)}
                />
              }
              label="Keep"
            />
          </Stack>
        ))}
        {review.saved.map((row) => (
          <Stack
            key={row.seq}
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              p: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Chip size="small" color="info" label="ALREADY SAVED" />
            <Typography variant="subtitle2">{row.command}</Typography>
            <Typography variant="body2" color="text.secondary">
              The saved job already has this
            </Typography>
          </Stack>
        ))}
        {refused && (
          <Typography variant="body2" color="text.secondary">
            The jobs this close links, repairs or resizes are worked out again
            from the saved jobs when you save.
          </Typography>
        )}
      </Stack>
    </ContentDialogue>
  );
}
