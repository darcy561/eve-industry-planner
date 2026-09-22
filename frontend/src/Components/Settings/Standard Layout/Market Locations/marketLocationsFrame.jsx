import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MenuItem, Stack, TextField, Typography } from "@mui/material";

import AddMarketForm from "./addMarketForm";
import PricedAgainst from "./pricedAgainst";
import UnsavedCitadelFee from "./unsavedCitadelFee";
import MarketEditor from "./marketEditor";
import MarketsTable from "./marketsTable";
import { marketRow } from "./marketRows";
import { FormField } from "../../../../Styled Components/Textfield/FormField";
import { SectionPanel } from "../../../../Styled Components/Paper/SectionPanel";
import { useMarketSources } from "../../../../Hooks/Static/useMarketSources";
import {
  SOURCE_KIND,
  isReadByTheReader,
} from "../../../../Functions/MarketData/marketSources";
import { summariseMarket, visibleBrokerFee } from "./marketSummary";
import { usePlannerSettingsForOwners } from "../../../../Hooks/React Query/plannerSettings";
import { useMarketIsEditable } from "./marketWriter";

/**
 * Managing the markets a reader prices against.
 *
 * Every market they may use, whether they saved it or an organisation they
 * belong to shared it, with what is true of each one now.
 */
export default function MarketLocationsFrame() {
  const sources = useMarketSources();
  // The hubs are configuration rather than markets a reader manages, so they
  // are not theirs to see here.
  const markets = useMemo(
    () => sources.filter((source) => source.kind !== SOURCE_KIND.HUB),
    [sources],
  );
  // Read so an organisation's markets can be edited here: the composed row says
  // what a panel shows, and a write needs that owner's own lane to apply a
  // change to.
  const owners = useMemo(
    () => markets.map((source) => source.sharedBy).filter(Boolean),
    [markets],
  );
  usePlannerSettingsForOwners(owners);

  const rows = useMarketRows(markets);
  const [open, setOpen] = useState(() => new Set());

  // Decided here rather than carried on the row: the settings above are still
  // arriving as the panel draws, and a row that fixed its answer before they
  // landed would stay uneditable until the reader left the tab and came back.
  const isEditable = useMarketIsEditable();
  const shown = useMemo(
    () => rows.map((row) => ({ ...row, editable: isEditable(row.sharedBy) })),
    [rows, isEditable],
  );

  const onToggleRow = useCallback((id) => {
    setOpen((showing) => {
      const next = new Set(showing);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  return (
    <Stack spacing={2.5}>
      <SectionPanel
        title="Where jobs are priced"
        subtitle="Which market a job's materials are bought at, where what it makes is sold, and which figure is read at each. A job or a market group can name another; these are what they fall back to."
        componentName="Priced against"
      >
        <PricedAgainst />
      </SectionPanel>

      <SectionPanel
        title="Markets you price against"
        subtitle="The markets you have saved, and the ones an organisation you belong to shares with you."
        componentName="Market locations"
      >
        <Stack spacing={2.5}>
          {shown.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              You have no markets saved, so jobs are priced against the trading
              hubs.
            </Typography>
          ) : (
            <MarketsTable
              rows={shown}
              open={open}
              onToggleRow={onToggleRow}
              renderEditor={(row) => <MarketEditor row={row} />}
            />
          )}

          {/* Beneath the list because it is what answers for a citadel that is
              not on it. */}
          <UnsavedCitadelFee />
        </Stack>
      </SectionPanel>

      <SectionPanel
        title="Add a market"
        subtitle="A market you save is yours alone. One saved for an organisation reaches its members once you share it."
        componentName="Add a market"
      >
        <AddMarketFor owners={editableOwners(shown)} />
      </SectionPanel>
    </Stack>
  );
}

/**
 * The rows the table draws, once each market has been asked when it was last
 * read.
 *
 * Asked through a query rather than an effect: the moment is held on this
 * device beside a market's prices, so this reads local storage rather than
 * fetching a resource — but it is still asynchronous work a render cannot do,
 * and the query is where asynchronous work belongs here.
 *
 * The table is drawn from what is already in hand while that settles, so a
 * reader sees their markets immediately and the moments fill in. A panel that
 * waited would show nothing at all while a disk read returned.
 */
function useMarketRows(markets) {
  const unreadRows = useMemo(
    () => markets.map((source) => marketRow(unread(source))),
    [markets],
  );

  const { data } = useQuery({
    queryKey: [
      "market",
      "summaries",
      markets.map((saved) => saved.id).join(","),
    ],
    queryFn: async () => {
      const summaries = await Promise.all(markets.map(summariseMarket));
      return summaries.map((summary) => marketRow(summary));
    },
    // The rows stand without their moments rather than the panel reporting a
    // disk that would not answer: nothing a reader can act on is missing.
    retry: false,
    staleTime: 0,
  });

  return data ?? unreadRows;
}

/**
 * A market before it has been asked when it was last read.
 *
 * A market the server prices already carries its clock, so it is shown straight
 * away rather than reading as unwalked until the disk answers about a market the
 * disk holds nothing for anyway.
 */
function unread(source) {
  const readHere = isReadByTheReader(source.kind);

  return {
    ...source,
    lastReadAt: readHere ? undefined : source.pricedAt || undefined,
    readHere,
    brokerFee: visibleBrokerFee(source),
  };
}

/**
 * Whose markets this reader may add to: their own account, and every
 * organisation whose settings are in hand.
 *
 * Taken from the rows rather than asked for separately, so the panel offers to
 * add a market exactly where it offers to edit one.
 */
function editableOwners(rows) {
  const shared = rows
    .filter((row) => row.sharedBy && row.editable)
    .map((row) => ({ key: row.sharedBy, label: row.sharedByLabel }));

  return [
    { key: "", label: "Your account" },
    ...new Map(shared.map((owner) => [owner.key, owner])).values(),
  ];
}

/**
 * Saving a market, for whichever owner the reader picked.
 *
 * The picker is absent where there is only one owner to save for, which is
 * every reader who belongs to no organisation that shares markets.
 *
 * @param {object} props
 * @param {Array<{key: string, label: string}>} props.owners
 */
function AddMarketFor({ owners }) {
  const [savingFor, setSavingFor] = useState("");
  const chosen = owners.some((owner) => owner.key === savingFor)
    ? savingFor
    : "";

  return (
    <Stack spacing={2}>
      {owners.length > 1 ? (
        <FormField
          title="Saved for"
          description="An organisation's market can be offered to every one of its members. Your own is yours alone."
        >
          <TextField
            select
            size="small"
            label="Saved for"
            value={chosen}
            onChange={(event) => setSavingFor(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            {owners.map((owner) => (
              <MenuItem key={owner.key || "account"} value={owner.key}>
                {owner.label}
              </MenuItem>
            ))}
          </TextField>
        </FormField>
      ) : null}

      {/* Remounted as the owner changes, so a part-filled form is not carried
          from one owner to another. */}
      <AddMarketForm key={chosen} sharedBy={chosen || undefined} />
    </Stack>
  );
}
