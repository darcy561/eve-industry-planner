import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Stack, TextField } from "@mui/material";

import { FormField } from "../../../../Styled Components/Textfield/FormField";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import VirtualisedLocationSearch from "../../../../Styled Components/autocomplete/virtualisedLocationSearch";
import useAssetLocations from "../../../../Hooks/EveEsi/useAssetLocations";
import useLocationNames from "../../../../Hooks/EveEsi/useLocationNames";
import describeMarketLocation from "../../../../Functions/Structure/describeMarketLocation";
import { MAX_BROKER_FEE_PERCENT } from "./newMarket";
import { newMarketLocation } from "./newMarket";
import {
  LOCATION_KIND,
  resolveLocationKind,
} from "../../../../Functions/Assets/assetLocationConstants";
import { showSnackbarSuccess } from "../../../../Events/snackbarEvents";
import { marketEdits } from "./marketWriter";

const PLACE_HELP =
  "Offered from the places your characters keep things, because a market you sell at is somewhere you have docked.";
const PLACE_UNREADABLE =
  "This location could not be read, so nothing could be priced at it. Try again in a moment.";
const CITADEL_UNREACHABLE =
  "None of your characters can read this citadel, so where it is cannot be worked out.";

/** Whether a location id names a player structure rather than an NPC station. */
const isCitadel = (locationID) =>
  Boolean(locationID) &&
  resolveLocationKind(locationID) !== LOCATION_KIND.STATION;

/**
 * Saving a market a reader can sell at.
 *
 * Everything but the name and a citadel's rate is derived from the place rather
 * than asked for — the region its orders are read from, and what an NPC
 * station's broker fee is worked out from.
 *
 * Derived as the place is chosen rather than when something first tries to
 * price there: a market saved without a region is offered in every picker and
 * prices nothing, and the reader who could have picked a different one has long
 * since moved on.
 *
 * @param {object} props
 * @param {string} [props.sharedBy] - The organisation to save it for, absent to
 *   save it for the reader's own account
 */
export default function AddMarketForm({ sharedBy }) {
  const places = useAssetLocations();

  const [locationID, setLocationID] = useState(0);
  const [name, setName] = useState("");
  const [brokerFee, setBrokerFee] = useState(0);
  const [nameError, setNameError] = useState(false);

  const place = usePlaceFacts(locationID);

  function add() {
    if (!name.trim()) return setNameError(true);
    if (!place.facts) return;

    const market = newMarketLocation({
      name: name.trim(),
      locationID,
      facts: place.facts,
      brokerFee,
    });
    marketEdits(sharedBy).add(market);
    showSnackbarSuccess(`${market.name} Added`);

    setLocationID(0);
    setName("");
    setBrokerFee(0);
  }

  return (
    <Stack spacing={2}>
      {/* A place whose region could not be read is as unusable as one that
          could not be listed, so it is said where the field is described rather
          than left for the reader to find when nothing prices. */}
      <FormField title="Location" description={place.error ?? PLACE_HELP}>
        <VirtualisedLocationSearch
          places={places.locations}
          value={locationID || ""}
          isLoading={places.isLoading}
          isError={places.isError || Boolean(place.error)}
          label="Market location"
          onChange={(chosen) => setLocationID(chosen ?? 0)}
        />
      </FormField>

      <FormField
        title="Display name"
        description="What this market is called in your job setups. It does not need to match its in-game name."
      >
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          label="Market name"
          value={name}
          error={nameError}
          helperText={
            nameError
              ? "Give this a name so you can tell it apart in lists."
              : " "
          }
          onChange={(event) => {
            if (event.target.value.trim()) setNameError(false);
            setName(event.target.value);
          }}
        />
      </FormField>

      {isCitadel(locationID) ? (
        <FormField
          title="Broker fee"
          description="The rate this citadel's owner set, which nothing can read from the game."
        >
          <TaxPercentageTextField
            id="new-market-broker-fee"
            label="Broker fee"
            helperText="Percent per order"
            max={MAX_BROKER_FEE_PERCENT}
            initialState={brokerFee}
            onBlur={setBrokerFee}
          />
        </FormField>
      ) : null}

      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        {/* Nothing to save until the place has answered: a row saved without
            what was derived from it would be a market that prices nothing. */}
        <Button variant="contained" onClick={add} disabled={!place.facts}>
          Add market
        </Button>
      </Stack>
    </Stack>
  );
}

/**
 * What the chosen place says about itself.
 *
 * A query rather than a change handler, because a citadel's answer arrives in
 * two parts: its system is read with a character's token as its name is, and
 * the region follows from the system. A handler would run once, with whatever
 * had arrived by the moment of the click.
 *
 * @returns {{facts: object|undefined, error: string|undefined}}
 */
function usePlaceFacts(locationID) {
  const citadel = useCitadelSystem(locationID);

  const { data, isError } = useQuery({
    queryKey: ["market", "place", locationID, citadel.systemID],
    queryFn: async () => {
      const facts = await describeMarketLocation(locationID, citadel.systemID);
      // Null is an answer here rather than a failure: the chain was walked and
      // did not reach a region. Thrown so the query reports it as one.
      if (!facts) throw new Error(PLACE_UNREADABLE);
      return facts;
    },
    enabled: Boolean(locationID) && !citadel.pending && !citadel.unreachable,
    staleTime: Infinity,
    retry: false,
  });

  if (citadel.unreachable) {
    return { facts: undefined, error: CITADEL_UNREACHABLE };
  }
  if (isError) return { facts: undefined, error: PLACE_UNREADABLE };
  return { facts: data, error: undefined };
}

/**
 * The system a chosen citadel sits in, and whether it can be reached at all.
 *
 * `/universe/structures/` answers with the whole structure, so the system is
 * already held beside the name the picker listed it under and asking again
 * would spend a call on what the cache has.
 *
 * A citadel every character was refused at has a name from the community store
 * but no system, and so no region: it is unreachable rather than pending, which
 * is what stops the form waiting for an answer that is not coming.
 *
 * A station names its own system, so nothing is asked for one.
 *
 * @returns {{systemID: number|undefined, pending: boolean, unreachable: boolean}}
 */
function useCitadelSystem(locationID) {
  const wanted = isCitadel(locationID) ? [locationID] : [];
  const { names, failed, isLoading } = useLocationNames(wanted);

  if (!wanted.length) {
    return { systemID: undefined, pending: false, unreachable: false };
  }

  const systemID = names[locationID]?.solar_system_id;
  if (systemID) return { systemID, pending: false, unreachable: false };

  const settled = failed.has(locationID) || Boolean(names[locationID]);
  return {
    systemID: undefined,
    pending: isLoading && !settled,
    unreachable: settled,
  };
}
