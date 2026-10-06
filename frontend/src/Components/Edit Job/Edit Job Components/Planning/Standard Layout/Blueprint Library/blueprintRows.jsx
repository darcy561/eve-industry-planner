import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import EveImageAvatar from "../../../../../../Styled Components/Avatar/EveImageAvatar";
import OwnerAvatar from "../../../../../../Styled Components/Avatar/OwnerAvatar";
import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import {
  Figure,
  FoldedList,
} from "../../../../../../Styled Components/Typography/figures";
import { TYPE_IMAGE } from "../../../../../../Functions/Shared/eveImage";
import { ownerName } from "../../../../../../Functions/Shared/eveOwner";
import { blueprintOwner } from "../../../../../../Functions/Blueprints/blueprintHolderLabel";
import applySetupChange from "../../../../../../Functions/Job/setups/applySetupChange";
import {
  countOf,
  formatQuantity,
} from "../../../../../../Functions/Helper/numberParser";
import { selectedSetup } from "../../../../Edit Job Hooks/jobSelectors";
import {
  jobDraftNow,
  useJobActions,
  useJobDraft,
} from "../../../../Edit Job Hooks/useJobDraft";
import { BLUEPRINT_JOB_STATE } from "../../../../../../Functions/Blueprints/blueprintJobState";

/**
 * @param {{print: object, runsLeft: number|null, runningRuns: number}} blueprint
 * @returns {string}
 */
export function blueprintKind({ print, runsLeft, runningRuns }) {
  if (!print.isCopy) return "Original";
  return runningRuns > 0
    ? `Copy · ${countOf(runsLeft, "run")} left of ${formatQuantity(print.runs)}`
    : `Copy · ${countOf(print.runs, "run")}`;
}

/**
 * @param {{print: object, runsLeft: number|null}} blueprint
 * @returns {string}
 */
function sourceWords({ print, runsLeft }) {
  return print.isCopy
    ? `the copy with ${countOf(runsLeft, "run")} left`
    : "the original";
}

/**
 * @param {{ME: number|undefined, TE: number|undefined}} research - The open setup's
 * @param {object} print
 * @returns {boolean}
 */
function setupIsOn(research, print) {
  return research.ME === print.me && research.TE * 2 === print.te;
}

function BlueprintRow({ blueprint, inSetup, othersMatching, onUse }) {
  const { print, status } = blueprint;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <Badge
        overlap="rectangular"
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        badgeContent={<OwnerAvatar owner={blueprintOwner(print)} size={16} />}
      >
        <EveImageAvatar
          type={print.typeId}
          variation={
            print.isCopy ? TYPE_IMAGE.BLUEPRINT_COPY : TYPE_IMAGE.BLUEPRINT
          }
          size={32}
          variant="square"
        />
      </Badge>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Figure>
          ME {print.me} · TE {print.te}
        </Figure>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          {blueprintKind(blueprint)} · {ownerName(blueprintOwner(print))}
        </Typography>
      </Box>
      {inSetup ? (
        <StatusChip
          label={
            othersMatching > 0
              ? `In this setup · ${othersMatching} more match`
              : "In this setup"
          }
          tone={STATUS_TONE.FACT}
        />
      ) : null}
      {status === BLUEPRINT_JOB_STATE.RUNNING ? (
        <StatusChip label="Running a job" tone={STATUS_TONE.WARN} />
      ) : null}
      {status === BLUEPRINT_JOB_STATE.RUNS_OUT ? (
        <StatusChip label="Runs out" tone={STATUS_TONE.BAD} />
      ) : null}
      {inSetup ? null : (
        <Button size="small" variant="outlined" onClick={onUse}>
          Use
        </Button>
      )}
    </Box>
  );
}

/**
 * The blueprints the reader holds as rows, the one the setup is already on marked, each applied to
 * the open setup with a Use that can be undone while the setup still holds what it wrote.
 *
 * @param {{blueprints: Array<object>}} props
 */
export default function BlueprintRows({ blueprints }) {
  const actions = useJobActions();
  const setupID = useJobDraft((job) => job.layout.setupToEdit);
  const ME = useJobDraft((job) => selectedSetup(job)?.ME);
  const TE = useJobDraft((job) => selectedSetup(job)?.TE);
  const [used, setUsed] = useState(null);
  const theme = useTheme();
  const shown = useMediaQuery(theme.breakpoints.down("sm")) ? 3 : 6;

  const applied =
    used &&
    used.setupID === setupID &&
    used.wrote.ME === ME &&
    used.wrote.TE === TE
      ? used
      : null;

  const matching = blueprints.filter((blueprint) =>
    setupIsOn({ ME, TE }, blueprint.print),
  );

  async function use(blueprint) {
    const target = selectedSetup(jobDraftNow());
    if (!target) return;
    const previous = { ME: target.ME, TE: target.TE };
    await applySetupChange(
      target,
      "use a blueprint you own",
      (next) => {
        next.updateMEValue(blueprint.print.me);
        next.updateTEValue(blueprint.print.te / 2);
      },
      actions,
    );
    setUsed({
      setupID: target.id,
      previous,
      wrote: { ME: blueprint.print.me, TE: blueprint.print.te / 2 },
      words: `Setup now at ME ${blueprint.print.me} · TE ${blueprint.print.te}, from ${sourceWords(blueprint)}`,
    });
  }

  async function undo() {
    const target = jobDraftNow().build.setup[applied.setupID];
    setUsed(null);
    if (!target) return;
    await applySetupChange(
      target,
      "put back the setup's research",
      (next) => {
        next.updateMEValue(applied.previous.ME);
        next.updateTEValue(applied.previous.TE);
      },
      actions,
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {applied ? (
        <InsetSurface
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography variant="body2">{applied.words}</Typography>
          <Button size="small" onClick={undo}>
            Undo
          </Button>
        </InsetSurface>
      ) : null}
      <FoldedList
        items={blueprints}
        renderItem={(blueprint) => (
          <BlueprintRow
            key={blueprint.print.itemId}
            blueprint={blueprint}
            inSetup={blueprint === matching[0]}
            othersMatching={matching.length - 1}
            onUse={() => use(blueprint)}
          />
        )}
        shown={shown}
        foldLabel={(folded) => `Show ${folded.length} more`}
      />
    </Box>
  );
}
