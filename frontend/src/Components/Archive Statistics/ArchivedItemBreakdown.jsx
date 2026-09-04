import { useMemo, useState } from "react";
import {
  Button,
  Fade,
  FormControl,
  Grid,
  Link,
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
} from "../../Context/appShell";
import {
  formatNumberForLocale,
  numberToShortText,
} from "../../Functions/Helper/numberParser";
import { useAccountTimelineItemsQuery } from "../../Hooks/React Query/Backend/statisticsTimeline";
import { ITEM_BREAKDOWN_TITLE } from "./ArchiveChartPanels";
import { useItemNames } from "../../Hooks/useItemNames";
import { timelineWindow } from "./useArchiveTimeline";

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
 * Fade rather than Collapse: Collapse wraps its child in a `div`, which is not
 * valid between a table body and a row.
 */
const ROW_FADE_MS = 220;
const ROW_STAGGER_MS = 40;

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


/** Money, abbreviated in the cell with the full value on hover. */
function Money({ value }) {
  const amount = Number(value ?? 0);
  return (
    <Tooltip title={formatNumberForLocale(amount)} arrow placement="top">
      <span>{numberToShortText(amount, 2)}</span>
    </Tooltip>
  );
}

/**
 * The item's name, as a link when there is somewhere to go.
 *
 * The name rather than the whole row: a row of figures that is also a control
 * has to announce itself as one, and the name is the part a reader is already
 * treating as the item.
 */
function ItemName({ name, onSelect }) {
  if (!onSelect) return name;
  return (
    <Link component="button" type="button" underline="hover" onClick={onSelect}>
      {name}
    </Link>
  );
}

function LoadingRows() {
  return Array.from({ length: ROWS_COLLAPSED }, (_, i) => (
    <TableRow key={i}>
      <TableCell>
        <Skeleton width="70%" />
      </TableCell>
      <TableCell align="right">
        <Skeleton width="50%" />
      </TableCell>
      <TableCell align="right">
        <Skeleton width="50%" />
      </TableCell>
      <TableCell align="right">
        <Skeleton width="50%" />
      </TableCell>
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
 *
 * @param {Object} [props]
 * @param {string} [props.from] - YYYY-MM; omit for the server's default window
 * @param {string} [props.to] - YYYY-MM
 * @param {(item: {typeID: number, name: string}) => void} [props.onSelectItem] -
 *   opens the item's own view; the name is plain text when it is not given
 */
export function ArchivedItemBreakdown({ from, to, range, onSelectItem } = {}) {
  const theme = useTheme();
  const [sort, setSort] = useState("profitLoss");
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? ROWS_EXPANDED : ROWS_COLLAPSED;

  const { data, isLoading } = useAccountTimelineItemsQuery({
    sort,
    limit,
    ...timelineWindow({ from, to, range }),
  });

  const fetched = useMemo(() => data?.items ?? [], [data]);
  // The shorter page can arrive from the cache in the same tick, so the rows
  // being faded out are held here until the transition reports it is done.
  const [collapsingRows, setCollapsingRows] = useState(null);
  const items = collapsingRows ?? fetched;
  const names = useItemNames(items);
  const totalItems = data?.paging?.totalItems ?? 0;
  // Offered only when there are rows the collapsed table is not already showing.
  const canExpand = totalItems > ROWS_COLLAPSED;

  const toggleRows = () => {
    if (expanded) {
      setCollapsingRows(items);
      setExpanded(false);
      return;
    }
    setCollapsingRows(null);
    setExpanded(true);
  };

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
            {ITEM_BREAKDOWN_TITLE}
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
                // A new ranking is a new list, so start it from the top. The
                // old rows are dropped rather than faded: they belong to an
                // ordering that no longer applies.
                setCollapsingRows(null);
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
            items.map((item, index) => {
              const profit = Number(item.profitLoss ?? 0);
              const revealed = index - ROWS_COLLAPSED;
              const row = (
                <TableRow key={item.typeID}>
                  <TableCell>
                    <ItemName
                      name={names[item.typeID] ?? `Type ${item.typeID}`}
                      onSelect={
                        onSelectItem &&
                        (() =>
                          onSelectItem({
                            typeID: item.typeID,
                            name: names[item.typeID] ?? `Type ${item.typeID}`,
                          }))
                      }
                    />
                  </TableCell>
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

              if (revealed < 0) return row;
              const isLastExtraRow = index === items.length - 1;
              return (
                <Fade
                  key={item.typeID}
                  in={expanded}
                  appear
                  timeout={ROW_FADE_MS}
                  // Revealing staggers; collapsing does not, so the table shuts
                  // in one step rather than unravelling backwards.
                  style={{
                    transitionDelay: expanded
                      ? `${revealed * ROW_STAGGER_MS}ms`
                      : "0ms",
                  }}
                  onExited={
                    isLastExtraRow ? () => setCollapsingRows(null) : undefined
                  }
                  unmountOnExit
                >
                  {row}
                </Fade>
              );
            })
          )}
        </TableBody>
      </Table>

      {canExpand && (
        <Grid container sx={{ justifyContent: "center", mt: 1 }}>
          <Button
            size="small"
            onClick={toggleRows}
            disabled={isLoading}
          >
            {expanded
              ? `Show top ${ROWS_COLLAPSED}`
              : `Show top ${ROWS_EXPANDED}`}
          </Button>
        </Grid>
      )}
    </Paper>
  );
}
