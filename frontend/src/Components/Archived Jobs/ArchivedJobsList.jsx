import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Pagination,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../Events/snackbarEvents";
import useUsersStore from "../../Zustand/usersStore";
import Job from "../../Classes/job";
import Group from "../../Classes/group";
import {
  RESTORE_SCOPES,
  restoreArchivedJobs,
} from "../../Functions/Endpoints/Private/archivedJobsList";
import {
  invalidateArchiveQueries,
  useArchivedJobsQuery,
} from "../../Hooks/React Query/Backend/archivedJobsList";
import { groupArchivedRows, blockTotals } from "./groupArchivedRows";

const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { key: "archivedAt", label: "Date archived" },
  { key: "name", label: "Name" },
  { key: "jobType", label: "Job type" },
];

/** ISK, or a dash when the rebuild has not folded the job yet. */
function Money({ value }) {
  if (value == null) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }
  return (
    <Typography
      variant="body2"
      color={value < 0 ? "error.main" : "text.primary"}
    >
      {formatNumberForLocale(value)}
    </Typography>
  );
}

/**
 * Applies a restore to the planner in this tab.
 *
 * The websocket excludes the tab that made the change from its own broadcast, so
 * this is the one client that will not be told. It applies the response it
 * already has rather than waiting for a push that is not coming.
 */
function applyRestoreLocally(result) {
  const { updateOrAddJobsToJobArray, addGroupToGroupArray } =
    useUsersStore.getState().jobData.actions;

  const jobs = (result?.jobs ?? []).map((document) => new Job(document));
  if (jobs.length > 0) updateOrAddJobsToJobArray(jobs);
  if (result?.group) addGroupToGroupArray(new Group(result.group));
}

/** What a restore reports back, in the terms a user can act on. */
function restoreSummary(result) {
  const restored = result?.restoredJobIDs?.length ?? 0;
  const parts = [`${restored} job${restored === 1 ? "" : "s"} restored`];

  const conflicts = result?.conflicts?.length ?? 0;
  if (conflicts > 0) {
    parts.push(
      `${conflicts} ESI link${conflicts === 1 ? "" : "s"} could not be reclaimed`,
    );
  }
  return parts.join(". ");
}

/** One archived job. */
function JobRow({ job, onRestore, busy }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ py: 0.75, pl: 2 }}
    >
      <Typography
        variant="body2"
        sx={{ flex: "1 1 200px", minWidth: 0 }}
        noWrap
      >
        {job.name}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ width: 96, flexShrink: 0 }}
      >
        {job.archivedAt?.slice(0, 10)}
      </Typography>
      <Box sx={{ width: 120, flexShrink: 0, textAlign: "right" }}>
        <Money value={job.measures?.jobCostTotal} />
      </Box>
      <Box sx={{ width: 120, flexShrink: 0, textAlign: "right" }}>
        <Money value={job.measures?.profitLoss} />
      </Box>
      <Button
        size="small"
        disabled={busy}
        onClick={() => onRestore(RESTORE_SCOPES.JOB, job.jobID)}
      >
        Restore
      </Button>
    </Stack>
  );
}

/** A group, a related set, or a single job. */
function Block({ block, onRestore, busy }) {
  const totals = useMemo(() => blockTotals(block.jobs), [block.jobs]);
  const isBlock = block.kind !== "job";

  if (!isBlock) {
    return <JobRow job={block.jobs[0]} onRestore={onRestore} busy={busy} />;
  }

  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Chip
          size="small"
          label={block.kind === "group" ? "Group" : "Linked"}
          color={block.kind === "group" ? "primary" : "default"}
          variant="outlined"
        />
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {block.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {block.jobs.length} jobs
          {totals.uncounted > 0 ? ` (${totals.uncounted} not yet counted)` : ""}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() =>
            onRestore(
              block.kind === "group"
                ? RESTORE_SCOPES.GROUP
                : RESTORE_SCOPES.RELATED,
              block.kind === "group" ? block.id : block.jobs[0].jobID,
            )
          }
        >
          Restore {block.kind === "group" ? "group" : "set"}
        </Button>
      </Stack>
      {block.jobs.map((job) => (
        <JobRow key={job.jobID} job={job} onRestore={onRestore} busy={busy} />
      ))}
    </Box>
  );
}

/**
 * The archive, and what can be brought back from it.
 *
 * @param {Object} [props]
 * @param {boolean} [props.enabled] - false until the tab holding this is opened
 */
export function ArchivedJobsList({ enabled = true }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("archivedAt");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => ({
      sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [sort, page, search],
  );

  const { data, isLoading, isError } = useArchivedJobsQuery(options, {
    enabled,
  });

  const blocks = useMemo(() => groupArchivedRows(data?.jobs ?? []), [data]);
  const totalJobs = data?.paging?.totalJobs ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalJobs / PAGE_SIZE));

  const handleRestore = async (scope, id) => {
    setBusy(true);
    try {
      const result = await restoreArchivedJobs(scope, id);
      if (!result) {
        showSnackbarError("Could not restore. Please try again.");
        return;
      }
      applyRestoreLocally(result);
      invalidateArchiveQueries(queryClient);
      showSnackbarSuccess(restoreSummary(result));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentPanel
      title="Archived jobs"
      componentName="Archived Jobs List"
      isLoading={isLoading}
      isError={isError}
    >
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            size="small"
            label="Search by name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            sx={{ flex: 1 }}
          />
          <Select
            size="small"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 180 }}
          >
            {SORT_OPTIONS.map((option) => (
              <MenuItem key={option.key} value={option.key}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </Stack>

        {blocks.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            sx={{ py: 4 }}
          >
            {search
              ? "No archived jobs match that name."
              : "Nothing archived yet."}
          </Typography>
        ) : (
          <Box>
            {blocks.map((block, index) => (
              <Box key={`${block.kind}:${block.id}`}>
                {index > 0 && <Divider />}
                <Block block={block} onRestore={handleRestore} busy={busy} />
              </Box>
            ))}
          </Box>
        )}

        {pageCount > 1 && (
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_event, next) => setPage(next)}
            sx={{ alignSelf: "center" }}
          />
        )}
      </Stack>
    </ContentPanel>
  );
}

export default ArchivedJobsList;
