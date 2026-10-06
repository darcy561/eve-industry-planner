import { Box, IconButton, Link, Tooltip } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import StatusChip, {
  STATUS_TONE,
} from "../../../../../../Styled Components/Chip/statusChip";
import {
  Figure,
  FoldedList,
} from "../../../../../../Styled Components/Typography/figures";
import EveImageAvatar from "../../../../../../Styled Components/Avatar/EveImageAvatar";
import { formatQuantity } from "../../../../../../Functions/Helper/numberParser";
import { showSnackbarError } from "../../../../../../Events/snackbarEvents";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { useJobActions } from "../../../../Edit Job Hooks/useJobDraft";
import { useOpenJob } from "../../../../Edit Job Hooks/useOpenJob";

/**
 * @param {{parent: import("../../../../../../Functions/Groups/parentRequirements").ParentCoverage}} props
 */
function ParentJobRow({ parent }) {
  const actions = useJobActions();
  const readOnly = useActiveJobReadOnly();
  const openJob = useOpenJob();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.75,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-of-type": { borderBottom: 0 },
      }}
    >
      <EveImageAvatar type={parent.itemID} size={24} variant="square" />
      <Link
        component="button"
        type="button"
        variant="body2"
        underline="hover"
        color="inherit"
        onClick={() => openJob(parent.jobID)}
        sx={{ flex: 1, minWidth: 0, textAlign: "left" }}
      >
        {parent.name}
      </Link>
      <Figure>{formatQuantity(parent.needs)}</Figure>
      {parent.needs === 0 ? (
        <StatusChip label="uses none" tone={STATUS_TONE.NEUTRAL} />
      ) : parent.short > 0 ? (
        <StatusChip
          label={`${formatQuantity(parent.short)} short`}
          tone={STATUS_TONE.WARN}
        />
      ) : (
        <StatusChip label="covered" tone={STATUS_TONE.GOOD} />
      )}
      <Tooltip
        arrow
        title={
          readOnly
            ? lockReasonText({ action: "unlinking is disabled" })
            : `Unlinks ${parent.name}`
        }
      >
        <span>
          <IconButton
            size="small"
            aria-label={`Unlink ${parent.name}`}
            disabled={readOnly}
            onClick={() => {
              actions.markParentJobForRemoval(parent.jobID);
              showSnackbarError(`${parent.name} Unlinked`);
            }}
            sx={{
              ml: 1,
              color: "text.secondary",
              "&:hover": { color: "error.main" },
            }}
          >
            <ClearIcon fontSize="inherit" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}

/**
 * The parents this job is owed to, one row each, with the smaller asks folded away past six.
 *
 * @param {{parents: Array<import("../../../../../../Functions/Groups/parentRequirements").ParentCoverage>}} props
 */
export default function ParentJobRows({ parents }) {
  return (
    <FoldedList
      items={parents}
      renderItem={(parent) => (
        <ParentJobRow key={parent.jobID} parent={parent} />
      )}
      foldLabel={(folded) => {
        const needs = folded.reduce((total, parent) => total + parent.needs, 0);
        const short = folded.reduce((total, parent) => total + parent.short, 0);
        return `Show the other ${folded.length} · ${formatQuantity(needs)} between them, ${
          short > 0 ? `${formatQuantity(short)} short` : "all covered"
        }`;
      }}
    />
  );
}
