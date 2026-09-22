import { Fragment } from "react";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  IconButton,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";

import {
  ColumnHeaderRow,
  ScrollingTable,
} from "../../../../Styled Components/Table/tableParts";
import StatusChip, {
  STATUS_TONE,
} from "../../../../Styled Components/Chip/statusChip";
import ExplainerTooltip from "../../../../Styled Components/Tooltip/ExplainerTooltip";

/**
 * Every market a reader may price against, and what is true of each right now.
 *
 * A real table rather than a list of boxes: this is tabular data with column
 * headers, and the semantics are what let a screen reader say which figure
 * belongs to which market. Editing opens beneath the row it belongs to, so a
 * reader changing one keeps sight of the others.
 */

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
                {/* The editor belongs to its row, so it spans the table rather
                    than floating over it: more than one can be open, and each
                    stays with its market as the list scrolls. Drawn only while
                    it is open, so a closed one holds no field state and asks
                    nothing of the store. */}
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
        <ExpandAffordance
          expandable={row.editable}
          isOpen={isOpen}
          name={row.name}
          onToggle={() => onToggleRow(row.id)}
        />
      </TableCell>
    </TableRow>
  );
}

/**
 * A station's fee is worked out from the seller's skills and standings rather
 * than stored, so there is no figure to show. Said in words on the dash, which
 * on its own reads as "missing" rather than "does not apply here".
 */
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
 * When these figures were current for this reader.
 *
 * An absent moment is two different sentences. A market the reader reads
 * themselves has not been read *on this device*, where another of their
 * machines may have read it. One the server prices has not been walked yet —
 * saving a market asks for it to be, and the first walk follows rather than
 * arriving with the save — so there are no figures at it, for anybody, until
 * that happens.
 */
function LastRead({ row }) {
  if (row.lastReadAt) {
    return <Typography variant="body2">{row.lastReadLabel}</Typography>;
  }

  return (
    <Typography variant="body2" color="text.secondary">
      {row.readHere
        ? "Not read on this device"
        : "Waiting for its first prices"}
    </Typography>
  );
}

/**
 * A market the reader did not save has nothing to open, so the chevron is
 * absent rather than present and inert — an affordance that can be operated and
 * does nothing is worse than none.
 */
function ExpandAffordance({ expandable, isOpen, name, onToggle }) {
  if (!expandable) return null;

  return (
    <IconButton
      size="small"
      aria-label={`${isOpen ? "Hide" : "Show"} the settings for ${name}`}
      aria-expanded={isOpen}
      onClick={onToggle}
      sx={{
        p: 0.25,
        color: "text.secondary",
        transform: isOpen ? "rotate(180deg)" : "none",
        transition: (theme) =>
          theme.transitions.create("transform", {
            duration: theme.transitions.duration.shortest,
          }),
      }}
    >
      <ExpandMoreIcon fontSize="small" />
    </IconButton>
  );
}
