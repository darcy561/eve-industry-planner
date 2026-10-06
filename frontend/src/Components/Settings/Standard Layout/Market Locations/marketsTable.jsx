import { Fragment } from "react";

import {
  Stack,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";

import {
  ColumnHeaderRow,
  ScrollingTable,
} from "../../../../Styled Components/Table/tableParts";
import { ExpandToggle } from "../../../../Styled Components/IconButton/ExpandToggle";
import StatusChip, {
  STATUS_TONE,
} from "../../../../Styled Components/Chip/statusChip";
import ExplainerTooltip from "../../../../Styled Components/Tooltip/ExplainerTooltip";

/** @type {Array<{id: string, label: string, align?: string}>} */
const COLUMNS = [
  { id: "name", label: "Market" },
  { id: "place", label: "Place" },
  { id: "read", label: "Last read" },
  { id: "fee", label: "Broker fee", align: "right" },
  { id: "from", label: "From" },
  { id: "open", label: "" },
];

/**
 * Every market a reader may price against and what is true of each now, each editable beneath its row.
 *
 * @param {object} props
 * @param {Array<object>} props.rows - One summarised market each
 * @param {Set<string>} props.open - Ids whose editor is showing
 * @param {(id: string) => void} props.onToggleRow
 * @param {(row: object) => React.ReactNode} [props.renderEditor]
 */
export default function MarketsTable({
  rows,
  open,
  onToggleRow,
  renderEditor,
}) {
  return (
    <ScrollingTable minWidth="sm" aria-label="Saved markets">
      <ColumnHeaderRow columns={COLUMNS} />
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <MarketRow
              row={row}
              isOpen={open.has(row.id)}
              onToggleRow={onToggleRow}
            />
            {renderEditor && row.editable && open.has(row.id) ? (
              <TableRow>
                <TableCell colSpan={COLUMNS.length} sx={{ p: 0, border: 0 }}>
                  {renderEditor(row)}
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        ))}
      </TableBody>
    </ScrollingTable>
  );
}

function MarketRow({ row, isOpen, onToggleRow }) {
  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="body2">{row.name}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {row.placeLabel}
        </Typography>
      </TableCell>
      <TableCell>
        <LastRead row={row} />
      </TableCell>
      <TableCell align="right">
        <BrokerFee fee={row.brokerFee} />
      </TableCell>
      <TableCell>
        {row.sharedByLabel ? (
          <StatusChip tone={STATUS_TONE.FACT} label={row.sharedByLabel} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            You
          </Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ width: 0 }}>
        {row.editable ? (
          <ExpandToggle
            isOpen={isOpen}
            onToggle={() => onToggleRow(row.id)}
            showLabel={`Show the settings for ${row.name}`}
            hideLabel={`Hide the settings for ${row.name}`}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/** A market's broker fee, or for a station, a dash saying why it is worked out per sale. */
function BrokerFee({ fee }) {
  if (fee !== undefined) {
    return <Typography variant="body2">{`${fee}%`}</Typography>;
  }

  return (
    <ExplainerTooltip title="An NPC station's broker fee comes from the seller's skills and standings, so it is worked out per sale rather than saved here.">
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    </ExplainerTooltip>
  );
}

/**
 * When this reader's figures for a market were current, and why they stopped arriving where the
 * reader can fix it.
 */
function LastRead({ row }) {
  return (
    <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
      {row.lastReadAt ? (
        <Typography variant="body2">{row.lastReadLabel}</Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {row.readProblem
            ? "No prices"
            : row.readHere
              ? "Not read on this device"
              : "Waiting for its first prices"}
        </Typography>
      )}
      {row.readProblem ? (
        <ExplainerTooltip title={row.readProblem.explain} focusable>
          <StatusChip tone={STATUS_TONE.WARN} label={row.readProblem.label} />
        </ExplainerTooltip>
      ) : null}
    </Stack>
  );
}
