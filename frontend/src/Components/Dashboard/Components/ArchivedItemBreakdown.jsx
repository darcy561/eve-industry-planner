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

/** How many rows the table shows before "Show more". */
const PAGE_SIZE = 5;

/**
 * Measures a reader can rank by.
 *
 * The server sorts, so these are request parameters rather than a client-side
 * comparator — ordering item types by profit needs every type in the window
 * before a page can be taken, which a page of rows cannot do.
 */
const SORT_OPTIONS = [
  { value: "profitLoss", label: "Profit" },
  { value: "salesTotal", label: "Sales" },
  { value: "jobCostTotal", label: "Cost" },
  { value: "quantitySold", label: "Quantity sold" },
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
  return Array.from({ length: PAGE_SIZE }, (_, i) => (
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
 * Ranking and paging happen on the server. `limit` grows rather than stepping
 * through pages: a reader following the biggest earners wants more of the same
 * list, not to lose sight of the top of it.
 */
export function ArchivedItemBreakdown() {
  const theme = useTheme();
  const [sort, setSort] = useState("profitLoss");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading } = useAccountTimelineItemsQuery({ sort, limit });

  const items = useMemo(() => data?.items ?? [], [data]);
  const names = useItemNames(items);
  const totalItems = data?.paging?.totalItems ?? 0;
  const hasMore = items.length < totalItems;

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
                setLimit(PAGE_SIZE);
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

      {hasMore && (
        <Grid container sx={{ justifyContent: "center", mt: 1 }}>
          <Button
            size="small"
            onClick={() => setLimit((current) => current + PAGE_SIZE)}
            disabled={isLoading}
          >
            {`Show more (${items.length} of ${totalItems})`}
          </Button>
        </Grid>
      )}
    </Paper>
  );
}
