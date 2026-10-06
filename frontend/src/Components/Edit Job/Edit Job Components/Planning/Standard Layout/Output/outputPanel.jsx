import { Button, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import ContentDialogue, {
  DialogueCloseAction,
  useDialogueTrigger,
} from "../../../../../../Styled Components/Dialogue/ContentDialogue";
import {
  FIGURE_TONE,
  FigureRow,
  HeadlineStat,
  PanelFooterMeta,
  PanelHeadline,
} from "../../../../../../Styled Components/Typography/figures";
import calculateTimeForSetup from "../../../../../../Functions/Blueprint Calculations/calculateTimeForSetup";
import {
  countOf,
  formatQuantity,
  formatTimeDuration,
} from "../../../../../../Functions/Helper/numberParser";
import { useJobCommitment } from "../../../../../../Hooks/Planner/useJobCommitment";
import {
  useJobDraft,
  useParentJobIDs,
} from "../../../../Edit Job Hooks/useJobDraft";
import { quantityProduced } from "../../../../Edit Job Hooks/jobSelectors";
import { ParentJobOptions } from "../../../../parentJobOptions";
import ParentJobRows from "./parentJobRows";
import {
  LockGatedTooltip,
  lockReasonText,
} from "../../../../../DocumentLock/LockGatedTooltip";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";

/**
 * @param {{commitment: import("../../../../../../Functions/Groups/parentRequirements").ParentCommitment, parentCount: number}} props
 */
function Owed({ commitment, parentCount }) {
  const { needed, madeByOthers, shortfall, surplus, parents } = commitment;
  const unloaded = parentCount - parents.length;
  return (
    <HeadlineStat
      caption={`Owed to ${countOf(parentCount, "parent")}`}
      value={formatQuantity(needed)}
      tone={shortfall > 0 ? FIGURE_TONE.BAD : FIGURE_TONE.PLAIN}
      size="beside"
    >
      <Typography variant="caption" color="text.secondary">
        {unloaded > 0
          ? `${countOf(unloaded, "parent")} not loaded here`
          : shortfall > 0
            ? `${formatQuantity(shortfall)} short`
            : madeByOthers > 0
              ? `with ${formatQuantity(madeByOthers)} from other jobs`
              : surplus > 0
                ? "every parent covered"
                : "covered exactly"}
      </Typography>
    </HeadlineStat>
  );
}

/**
 * @param {{commitment: import("../../../../../../Functions/Groups/parentRequirements").ParentCommitment}} props
 */
function FreeToSell({ commitment }) {
  const { surplus, committed, hasParents } = commitment;
  return (
    <HeadlineStat
      caption="Free to sell"
      value={
        surplus === 0
          ? "None"
          : committed === 0
            ? `All ${formatQuantity(surplus)}`
            : formatQuantity(surplus)
      }
      size="beside"
    >
      <Typography variant="caption" color="text.secondary">
        {surplus === 0
          ? "every item is spoken for"
          : hasParents
            ? "spare after the parents"
            : "nothing is committed"}
      </Typography>
    </HeadlineStat>
  );
}

/**
 * What the job produces, how much of it is owed to the jobs above it, and those parents as rows.
 */
export function OutputPanel() {
  const queryClient = useQueryClient();
  const commitment = useJobCommitment();
  const linkParent = useDialogueTrigger();
  const readOnly = useActiveJobReadOnly();
  const name = useJobDraft((job) => job.name);
  const itemID = useJobDraft((job) => job.itemID);
  const skills = useJobDraft((job) => job.skills);
  const setups = useJobDraft((job) => job.build.setup);
  const perRun = useJobDraft((job) => job.itemsProducedPerRun);

  const setupList = Object.values(setups ?? {});
  const produced = quantityProduced(setups, perRun);
  const runs = setupList.reduce(
    (total, { runCount, jobCount }) => total + runCount * jobCount,
    0,
  );
  const longest = Math.max(
    0,
    ...setupList.map(
      (setup) => calculateTimeForSetup(setup, skills, queryClient, itemID) ?? 0,
    ),
  );
  const parentCount = useParentJobIDs().length;
  const { needed, shortfall } = commitment;
  const runsToCover = perRun > 0 ? Math.ceil(shortfall / perRun) : 0;
  const slots = setupList.reduce((total, { jobCount }) => total + jobCount, 0);
  const coveredExactly =
    commitment.hasParents && shortfall === 0 && commitment.surplus === 0;
  const spare =
    commitment.hasParents && shortfall === 0 && commitment.surplus > 0;

  return (
    <AppShellPanel
      title="Output"
      componentName="OutputPanel"
      paperSx={{ height: "auto" }}
      action={
        <LockGatedTooltip
          readOnly={readOnly}
          reason={lockReasonText({ action: "linking is disabled" })}
        >
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={linkParent.open}
            disabled={readOnly}
          >
            Link a parent
          </Button>
        </LockGatedTooltip>
      }
    >
      <ContentDialogue
        {...linkParent.dialogueProps}
        title="Link a parent job"
        componentName="Link Parent Job"
        useAppShellDesign
        fullWidth
        actions={<DialogueCloseAction onClose={linkParent.close} />}
      >
        <ParentJobOptions onLinked={linkParent.close} />
      </ContentDialogue>
      <Stack spacing={2}>
        <PanelHeadline
          aside={
            <>
              {commitment.hasParents ? (
                <Owed commitment={commitment} parentCount={parentCount} />
              ) : null}
              <FreeToSell commitment={commitment} />
            </>
          }
        >
          <HeadlineStat
            caption="This job produces"
            value={formatQuantity(produced)}
          >
            <Typography variant="caption" color="text.secondary">
              {name}
            </Typography>
          </HeadlineStat>
        </PanelHeadline>

        {shortfall > 0 ? (
          <Typography variant="body2" color="error.main">
            {formatQuantity(needed - shortfall)} of the {formatQuantity(needed)}{" "}
            asked for.{" "}
            {runsToCover > 0
              ? `${countOf(runsToCover, "more run")} on any setup covers it.`
              : null}
          </Typography>
        ) : null}
        {coveredExactly && needed > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {setupList.length > 1
              ? "Taking runs off any setup leaves the parents short."
              : "Taking runs off leaves the parents short."}
          </Typography>
        ) : null}
        {spare ? (
          <Typography variant="body2" color="text.secondary">
            {formatQuantity(commitment.committed)} owed,{" "}
            {formatQuantity(commitment.surplus)} spare.
          </Typography>
        ) : null}

        {commitment.parents.length > 0 ? (
          <ParentJobRows parents={commitment.parents} />
        ) : null}

        <Stack>
          <PanelFooterMeta value={formatQuantity(produced)}>
            {formatQuantity(perRun)} per run × {formatQuantity(runs)} runs over{" "}
            {countOf(setupList.length, "setup")} =
          </PanelFooterMeta>
          <FigureRow
            label="Longest setup"
            sublabel={`${countOf(slots, "slot")} side by side — the wait if every one can start at once`}
            value={longest > 0 ? formatTimeDuration(longest) : null}
          />
        </Stack>
      </Stack>
    </AppShellPanel>
  );
}
