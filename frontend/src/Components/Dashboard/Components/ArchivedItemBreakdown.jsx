import { useEffect, useMemo, useState } from "react";
import {
  Button,
  FormControl,
  Grid,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import {
  appShellOutlinedFormControl,
  appShellSetupSectionPaperSx,
  getAppShellSelectMenuProps,
} from "../../../Context/appShell";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../../Functions/Helper/numberParser";
import { getFullItemList } from "../../../Functions/Helper/getCachedData";
import { useAccountTimelineItemsQuery } from "../../../Hooks/React Query/Backend/statisticsTimeline";

/**
 * The two lengths this table has.
 *
 * A fixed toggle rather than a growing list: a dashboard tile that can keep
 * expanding competes with the panels beneath it, and a reader wanting the whole
 * ranking is asking for a different view rather than a longer tile.
 */
const ROWS_COLLAPSED = 5;
const ROWS_EXPANDED = 10;

/**
 * Measures a reader can rank by.
 *
 * Two, deliberately. This is a dashboard glance rather than an analysis tool, so
 * it answers "what earned most" and "what cost most" and leaves the rest to a
 * fuller view. The API accepts more, and adding one here is a line.
 *
 * The server sorts, so these are request parameters rather than a client-side
 * comparator — ordering item types by profit needs every type in the window
 * before a page can be taken, which a page of rows cannot do.
 */
const SORT_OPTIONS = [
  { value: "profitLoss", label: "Total Profit" },
  { value: "jobCostTotal", label: "Total Cost" },
];

/**
 * Item names for the rows on screen.
 *
 * The endpoint returns type ids; names live in a cached list the app already
 * loads. Resolving them here rather than per row means one lookup per page
 * regardless of how many rows it holds.
 *
 * @param {{typeID: number}[]} items
 */
function useItemNames(items) {
  const [names, setNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return undefined;

    getFullItemList()
      .then((list) => {
        if (cancelled || !list) return;
        setNames(
          Object.fromEntries(
            items.map(({ typeID }) => [typeID, list[typeID]?.name ?? `Type ${typeID}`])
          )
        );
      })
      .catch(() => {
        // A missing name is cosmetic; the figures still read correctly against
        // the type id.
      });

    return () => {
      cancelled = true;
    };
  }, [items]);

  return names;
}

/** Money, abbreviated in the cell with the full value on hover. */
function Money({ value }) {
  const amount = Number(value ?? 0);
  return (
    <Tooltip title={formatNumberForLocale(amount)} arrow placement="top">
      <span>{numberToShortText(amount, 2)}</span>
    </Tooltip>
  );
}

function LoadingRows() {
  return Array.from({ length: ROWS_COLLAPSED }, (_, i) => (
    <TableRow key={i}>
      <TableCell><Skeleton width="70%" /></TableCell>
      <TableCell align="right"><Skeleton width="50%" /></TableCell>
      <TableCell align="right"><Skeleton width="50%" /></TableCell>
      <TableCell align="right"><Skeleton width="50%" /></TableCell>
    </TableRow>
  ));
}

/**
 * Which items drove this month's figures.
 *
 * Reads the same window as the comparison above it — the current month and the
 * one before — so the rows explain the totals rather than describing a different
 * period.
 *
 * Ranking and paging happen on the server; the toggle changes how many rows are
 * asked for rather than slicing a list already fetched.
 */
export function ArchivedItemBreakdown() {
  const theme = useTheme();
  const [sort, setSort] = useState("profitLoss");
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? ROWS_EXPANDED : ROWS_COLLAPSED;

  const { data, isLoading } = useAccountTimelineItemsQuery({ sort, limit });

  const items = useMemo(() => data?.items ?? [], [data]);
  const names = useItemNames(items);
  const totalItems = data?.paging?.totalItems ?? 0;
  // Offered only when there are rows the collapsed table is not already showing.
  const canExpand = totalItems > ROWS_COLLAPSED;

  return (
    <Paper variant="outlined" sx={{ ...appShellSetupSectionPaperSx, p: 2 }}>
      <Grid container spacing={1.5} sx={{ alignItems: "center", mb: 1 }}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Typography
            sx={{
              typography: { xs: "caption", md: "body2" },
              color: "text.secondary",
            }}
          >
            What drove it
          </Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <FormControl
            fullWidth
            size="small"
            sx={(t) => ({ ...appShellOutlinedFormControl(t) })}
          >
            <Select
              value={sort}
              onChange={(e) => {
                setSort(String(e.target.value));
                // A new ranking is a new list, so start it from the top rather
                // than keeping an expansion that referred to the old order.
                setExpanded(false);
              }}
              MenuProps={getAppShellSelectMenuProps(theme)}
            >
              {SORT_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Item</TableCell>
            <TableCell align="right">Cost</TableCell>
            <TableCell align="right">Sales</TableCell>
            <TableCell align="right">Profit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {isLoading && items.length === 0 ? (
            <LoadingRows />
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary">
                  Nothing archived in this period yet.
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const profit = Number(item.profitLoss ?? 0);
              return (
                <TableRow key={item.typeID}>
                  <TableCell>{names[item.typeID] ?? `Type ${item.typeID}`}</TableCell>
                  <TableCell align="right">
                    <Money value={item.jobCostTotal} />
                  </TableCell>
                  <TableCell align="right">
                    <Money value={item.salesTotal} />
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: profit < 0 ? "error.main" : "success.main" }}
                  >
                    <Money value={profit} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {canExpand && (
        <Grid container sx={{ justifyContent: "center", mt: 1 }}>
          <Button
            size="small"
            onClick={() => setExpanded((current) => !current)}
            disabled={isLoading}
          >
            {expanded ? `Show top ${ROWS_COLLAPSED}` : `Show top ${ROWS_EXPANDED}`}
          </Button>
        </Grid>
      )}
    </Paper>
  );
}
