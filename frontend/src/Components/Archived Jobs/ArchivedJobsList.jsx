import { useMemo, useState, useTransition } from "react";
import {
  Box,
  Button,
  Chip,
  FormControl,
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
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  appShellInsetSurfaceSx,
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../Context/appShell";
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
import { FileMonthsDialogue } from "./FileMonthsDialogue";

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

/**
 * What the figures beside a row are worth.
 *
 * Two different things a reader can act on. Pending resolves itself in seconds
 * and the figures are already right — a job's own numbers are written when it is
 * archived. Stale does not resolve: the last rebuild could not read the job, so
 * the figures are the ones it had before, and they stay that way until the job
 * is fixed and the statistics are recalculated.
 */
function FiguresChip({ awaiting, stale, filed }) {
  if (stale) {
    return (
      <Tooltip title="These figures could not be recalculated from this job, so they are the last ones worked out. They update when the job is corrected.">
        <Chip size="small" variant="outlined" color="error" label="Stale" />
      </Tooltip>
    );
  }
  if (awaiting) {
    return (
      <Tooltip title="This job's figures are correct, but are not in your account totals yet.">
        <Chip size="small" variant="outlined" color="warning" label="Pending" />
      </Tooltip>
    );
  }
  if (filed) {
    return (
      <Tooltip title="You chose which months this job's figures count in, so they may not match its dates.">
        <Chip size="small" variant="outlined" color="info" label="Filed" />
      </Tooltip>
    );
  }
  return null;
}

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
  const { jobData } = useUsersStore.getState();
  const { updateOrAddJobsToJobArray, addGroupToGroupArray, updateModifiedGroups } =
    jobData.actions;

  const jobs = (result?.jobs ?? []).map((document) => new Job(document));
  if (jobs.length > 0) updateOrAddJobsToJobArray(jobs);

  // The server has already written these, so the store only has to agree: a
  // group the restore rebuilt is new here, one it merged into is already held.
  for (const document of result?.groups ?? []) {
    const group = new Group(document);
    const held = jobData.groupArray.some((g) => g.groupID === group.groupID);
    if (held) {
      updateModifiedGroups(group, { queuePersist: false });
    } else {
      addGroupToGroupArray(group);
    }
  }
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
function JobRow({ job, onRestore, onFile, busy, indented }) {
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
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <SegmentChip segment={job.measures?.segment} />
          <FiguresChip
            awaiting={job.awaitingTotals}
            stale={job.figuresStale}
            filed={job.monthsFiled}
          />
        </Stack>
      </TableCell>
      <TableCell align="right">
        <Money value={job.measures?.jobCostTotal} />
      </TableCell>
      <TableCell align="right">
        <Money value={job.measures?.profitLoss} />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
          <Button size="small" disabled={busy} onClick={() => onFile({ kind: "job", id: job.jobID, label: job.name, jobs: [job] })}>
            Months
          </Button>
          <Button
            size="small"
            disabled={busy}
            onClick={() => onRestore(RESTORE_SCOPES.JOB, job.jobID)}
          >
            Restore
          </Button>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

/**
 * One archived job as a card.
 *
 * A table of six columns cannot be read on a phone, and scrolling it sideways
 * hides the figures behind the name. The card labels each value instead, so
 * nothing depends on a header that has scrolled out of view.
 */
function JobCard({ job, onRestore, onFile, busy }) {
  return (
    <Box
      sx={(theme) => ({
        ...appShellInsetSurfaceSx(theme),
        p: 1.5,
      })}
    >
      <Stack spacing={1}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Typography variant="subtitle2">{job.name}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <SegmentChip segment={job.measures?.segment} />
            <FiguresChip
            awaiting={job.awaitingTotals}
            stale={job.figuresStale}
            filed={job.monthsFiled}
          />
          </Stack>
        </Stack>

        <Stack direction="row" spacing={2}>
          <Field label="Job cost">
            <Money value={job.measures?.jobCostTotal} />
          </Field>
          <Field label="Profit / loss">
            <Money value={job.measures?.profitLoss} />
          </Field>
          <Field label="Archived">
            <Typography variant="body2" color="text.secondary">
              {job.archivedAt?.slice(0, 10) ?? "—"}
            </Typography>
          </Field>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            fullWidth
            variant="outlined"
            disabled={busy}
            onClick={() => onFile({ kind: "job", id: job.jobID, label: job.name, jobs: [job] })}
          >
            Months
          </Button>
          <Button
            size="small"
            fullWidth
            variant="outlined"
            disabled={busy}
            onClick={() => onRestore(RESTORE_SCOPES.JOB, job.jobID)}
          >
            Restore
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * What the dialogue is asked to file.
 *
 * A block is filed as one, so it names its group or related set and the server
 * selects the members — the same three ways restore names them. The months it
 * opens on come from the first row, since a set archived together shares them.
 */
function filingTarget(block) {
  const [first] = block.jobs;
  return {
    scope:
      block.kind === "group"
        ? RESTORE_SCOPES.GROUP
        : block.kind === "related"
          ? RESTORE_SCOPES.RELATED
          : RESTORE_SCOPES.JOB,
    id: block.kind === "job" ? first.jobID : block.id,
    name: block.label ?? first.name,
    jobCount: block.jobs.length,
    costMonth: first.costMonth,
    salesMonth: first.salesMonth,
    // A set files what it can, so only a lone job locks the whole dialogue.
    salesFromMarket:
      block.jobs.length === 1
        ? Boolean(first.salesFromMarket)
        : block.jobs.every((job) => job.salesFromMarket),
  };
}

/** A labelled value, so a card carries its own headings. */
function Field({ label, children }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Box sx={{ mt: 0.25 }}>{children}</Box>
    </Box>
  );
}

/** A group or linked set as a card, with its members inside it. */
function BlockCard({ block, onRestore, onFile, busy }) {
  const totals = useMemo(() => blockTotals(block.jobs), [block.jobs]);

  if (block.kind === "job") {
    return (
      <JobCard job={block.jobs[0]} onRestore={onRestore} onFile={onFile} busy={busy} />
    );
  }

  const isGroup = block.kind === "group";
  return (
    <Box
      sx={(theme) => ({
        ...appShellInsetSurfaceSx(theme),
        p: 1.5,
      })}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip
            size="small"
            label={isGroup ? "Group" : "Linked"}
            color={isGroup ? "primary" : "default"}
            variant="outlined"
          />
          <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {block.label}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2}>
          <Field label="Job cost">
            <Money value={totals.counted > 0 ? totals.jobCostTotal : null} />
          </Field>
          <Field label="Profit / loss">
            <Money value={totals.counted > 0 ? totals.profitLoss : null} />
          </Field>
          <Field label="Jobs">
            <Typography variant="body2">{block.jobs.length}</Typography>
          </Field>
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            fullWidth
            variant="outlined"
            disabled={busy}
            onClick={() => onFile(block)}
          >
            Months
          </Button>
          <Button
            size="small"
            fullWidth
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
        </Stack>

        <Stack spacing={1} sx={{ pl: 1.5 }}>
          {block.jobs.map((job) => (
            <JobCard
              key={job.jobID}
              job={job}
              onRestore={onRestore}
              onFile={onFile}
              busy={busy}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

/** A group, a related set, or a single job. */
function Block({ block, onRestore, onFile, busy }) {
  const totals = useMemo(() => blockTotals(block.jobs), [block.jobs]);

  if (block.kind === "job") {
    return (
      <JobRow job={block.jobs[0]} onRestore={onRestore} onFile={onFile} busy={busy} />
    );
  }

  const isGroup = block.kind === "group";
  return (
    <>
      <TableRow sx={{ backgroundColor: "action.hover" }}>
        <TableCell sx={{ pl: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
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
          <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
            <Button size="small" disabled={busy} onClick={() => onFile(block)}>
              Months
            </Button>
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
          </Stack>
        </TableCell>
      </TableRow>
      {block.jobs.map((job) => (
        <JobRow
          key={job.jobID}
          job={job}
          onRestore={onRestore}
          onFile={onFile}
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
  const theme = useTheme();
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("md"));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("archivedAt");
  const [page, setPage] = useState(1);
  // A restore is an action rather than a flag: React holds the pending state
  // for as long as the write and the refresh it triggers are in flight, so the
  // rows stay disabled until the list they belong to is the new one.
  const [busy, startRestore] = useTransition();
  // The row whose months are being changed, or null when the dialogue is shut.
  const [filing, setFiling] = useState(null);

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

  const handleRestore = (scope, id) => {
    startRestore(async () => {
      const result = await restoreArchivedJobs(scope, id);
      if (!result) {
        showSnackbarError("Could not restore. Please try again.");
        return;
      }
      applyRestoreLocally(result);
      invalidateArchiveQueries(queryClient);
      showSnackbarSuccess(restoreSummary(result));
    });
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
          <FormControl
            size="small"
            sx={(t) => ({ ...appShellOutlinedFormControl(t), minWidth: 180 })}
          >
            <Select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              MenuProps={getAppShellSelectMenuProps(theme)}
            >
              {SORT_OPTIONS.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
          <Box sx={{ width: "100%" }}>
            {deviceNotMobile ? (
              <Table size="small">
                <ListHeader />
                <TableBody>
                  {blocks.map((block) => (
                    <Block
                      key={`${block.kind}:${block.id}`}
                      block={block}
                      onRestore={handleRestore}
                      onFile={(block) => setFiling(filingTarget(block))}
                      busy={busy}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Stack spacing={1.5}>
                {blocks.map((block) => (
                  <BlockCard
                    key={`${block.kind}:${block.id}`}
                    block={block}
                    onRestore={handleRestore}
                    onFile={(block) => setFiling(filingTarget(block))}
                    busy={busy}
                  />
                ))}
              </Stack>
            )}
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

      {/* Mounted only while a job is being filed: the pickers read their months
          once, when they mount, so a dialogue that outlived the row would open
          on the values of whichever job it first saw — none. */}
      {filing && (
        <FileMonthsDialogue
          target={filing}
          onClose={() => setFiling(null)}
          onFiled={(result) => {
            // The months moved, so both the list and the figures they feed are
            // out of date; the rebuild the server queued does the rest.
            invalidateArchiveQueries(queryClient);
            const locked = result?.salesLockedByMarket ?? 0;
            showSnackbarSuccess(
              locked > 0
                ? `Months updated. ${locked} sale${locked === 1 ? "" : "s"} came from the market and stayed where ${locked === 1 ? "it was" : "they were"}.`
                : "Months updated. Your totals will follow shortly.",
            );
          }}
        />
      )}
    </AppShellPanel>
  );
}

export default ArchivedJobsList;
