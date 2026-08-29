import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import AppShellPanel from "../../Styled Components/Paper/AppShellPanel";
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
      <Tooltip
        arrow
        title="Not counted yet — the statistics rebuild has not reached this job."
      >
        <Typography variant="body2" color="text.disabled">
          —
        </Typography>
      </Tooltip>
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
 * What each column means. The figures are per job and come from the statistics
 * rebuild, so a reader needs telling which cost and whose profit.
 */
const COLUMNS = [
  { key: "name", label: "Job", align: "left" },
  { key: "archivedAt", label: "Archived", align: "left", width: 110 },
  {
    key: "segment",
    label: "Outcome",
    align: "left",
    width: 110,
    help: "Whether the build sold on the market, was kept as stock, or fed another job.",
  },
  {
    key: "jobCostTotal",
    label: "Job cost",
    align: "right",
    width: 140,
    help: "Everything the job cost to build: materials, install fees, extras and any invention.",
  },
  {
    key: "profitLoss",
    label: "Profit / loss",
    align: "right",
    width: 140,
    help: "Sales minus job cost. Zero where nothing sold, rather than a loss the size of the build.",
  },
  { key: "actions", label: "", align: "right", width: 110 },
];

/** Column headings, with a note on the ones whose meaning is not obvious. */
function ListHeader() {
  return (
    <TableHead>
      <TableRow>
        {COLUMNS.map((column) => (
          <TableCell
            key={column.key}
            align={column.align}
            sx={{ width: column.width, whiteSpace: "nowrap" }}
          >
            {column.help ? (
              <Tooltip arrow title={column.help}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ borderBottom: "1px dotted", cursor: "help" }}
                >
                  {column.label}
                </Typography>
              </Tooltip>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {column.label}
              </Typography>
            )}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

/** How a job's output was disposed of, as the statistics pipeline classified it. */
const SEGMENT_LABELS = {
  standaloneRecordedSale: { label: "Market", colour: "success" },
  retainedStock: { label: "Stock", colour: "default" },
  productionChain: { label: "Chain", colour: "info" },
};

function SegmentChip({ segment }) {
  const meta = SEGMENT_LABELS[segment];
  if (!meta) {
    return (
      <Typography variant="caption" color="text.disabled">
        —
      </Typography>
    );
  }
  return (
    <Chip
      size="small"
      variant="outlined"
      label={meta.label}
      color={meta.colour}
    />
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
function JobRow({ job, onRestore, busy, indented }) {
  return (
    <TableRow hover>
      <TableCell sx={{ pl: indented ? 4 : 2 }}>
        <Typography variant="body2" noWrap>
          {job.name}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="caption" color="text.secondary">
          {job.archivedAt?.slice(0, 10) ?? "—"}
        </Typography>
      </TableCell>
      <TableCell>
        <SegmentChip segment={job.measures?.segment} />
      </TableCell>
      <TableCell align="right">
        <Money value={job.measures?.jobCostTotal} />
      </TableCell>
      <TableCell align="right">
        <Money value={job.measures?.profitLoss} />
      </TableCell>
      <TableCell align="right">
        <Button
          size="small"
          disabled={busy}
          onClick={() => onRestore(RESTORE_SCOPES.JOB, job.jobID)}
        >
          Restore
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** A group, a related set, or a single job. */
function Block({ block, onRestore, busy }) {
  const totals = useMemo(() => blockTotals(block.jobs), [block.jobs]);

  if (block.kind === "job") {
    return <JobRow job={block.jobs[0]} onRestore={onRestore} busy={busy} />;
  }

  const isGroup = block.kind === "group";
  return (
    <>
      <TableRow sx={{ backgroundColor: "action.hover" }}>
        <TableCell sx={{ pl: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip
              arrow
              title={
                isGroup
                  ? "Archived together as a group. Restoring rebuilds the group from these jobs."
                  : "Linked through parent and child jobs. Restoring brings back the whole chain."
              }
            >
              <Chip
                size="small"
                label={isGroup ? "Group" : "Linked"}
                color={isGroup ? "primary" : "default"}
                variant="outlined"
              />
            </Tooltip>
            <Typography variant="subtitle2" noWrap>
              {block.label}
            </Typography>
          </Stack>
        </TableCell>
        <TableCell colSpan={2}>
          <Typography variant="caption" color="text.secondary">
            {block.jobs.length} jobs
            {totals.uncounted > 0
              ? ` · ${totals.uncounted} not counted yet`
              : ""}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Money value={totals.counted > 0 ? totals.jobCostTotal : null} />
        </TableCell>
        <TableCell align="right">
          <Money value={totals.counted > 0 ? totals.profitLoss : null} />
        </TableCell>
        <TableCell align="right">
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() =>
              onRestore(
                isGroup ? RESTORE_SCOPES.GROUP : RESTORE_SCOPES.RELATED,
                isGroup ? block.id : block.jobs[0].jobID,
              )
            }
          >
            Restore {isGroup ? "group" : "set"}
          </Button>
        </TableCell>
      </TableRow>
      {block.jobs.map((job) => (
        <JobRow
          key={job.jobID}
          job={job}
          onRestore={onRestore}
          busy={busy}
          indented
        />
      ))}
    </>
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
    <AppShellPanel
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
          <Box sx={{ width: "100%", overflowX: "auto" }}>
            <Table size="small">
              <ListHeader />
              <TableBody>
                {blocks.map((block) => (
                  <Block
                    key={`${block.kind}:${block.id}`}
                    block={block}
                    onRestore={handleRestore}
                    busy={busy}
                  />
                ))}
              </TableBody>
            </Table>
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
    </AppShellPanel>
  );
}

export default ArchivedJobsList;
