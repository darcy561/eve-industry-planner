import { Box, Stack, Typography } from "@mui/material";

import AppShellPanel from "../../../../Styled Components/Paper/AppShellPanel";
import InsetSurface from "../../../../Styled Components/Paper/InsetSurface";
import {
  FigureCaption,
  FigureRow,
} from "../../../../Styled Components/Typography/figures";
import { PRICING_SIDES } from "../../../../Functions/MarketData/pricingSide";
import {
  useAncestorPath,
  useMarketGroupTree,
} from "../../../../Hooks/Static/useMarketGroups";
import useUsersStore from "../../../../Zustand/usersStore";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { listingType } from "../../../../Context/defaultValues";

const { MARKET_OPTIONS } = GLOBAL_CONFIG;

/**
 * What a market a group prices against is called.
 *
 * An id the hub list does not carry is shown as itself rather than dropped: a
 * reader has to be able to see a choice in order to change it, and the list is
 * about to admit markets beyond the four hubs.
 *
 * @param {string|undefined} id
 * @returns {string}
 */
function marketName(id) {
  if (!id) return "—";
  return MARKET_OPTIONS.find((option) => option.id === id)?.name ?? id;
}

/**
 * What a pricing basis is called.
 *
 * @param {string|undefined} id
 * @returns {string}
 */
function basisName(id) {
  if (!id) return "—";
  return listingType.find((entry) => entry.id === id)?.name ?? id;
}

/**
 * One group's row: what it is, where it sits, and what it prices against.
 *
 * The path is what makes the name usable — "Minerals" alone does not say whether
 * it is the one the reader meant, and a group set on a container covers
 * everything beneath it.
 *
 * @param {object} props
 * @param {number} props.groupID
 * @param {{market?: string, basis?: string}} props.choice
 */
function GroupRow({ groupID, choice }) {
  const path = useAncestorPath(groupID);
  const name = path.at(-1)?.name;
  const within = path.slice(0, -1).map((step) => step.name);

  return (
    <FigureRow
      // A group the published tree no longer carries still has to be visible, or
      // a reader cannot clear what they set.
      label={name ?? `Group ${groupID}`}
      sublabel={within.length > 0 ? within.join(" › ") : undefined}
      value={`${marketName(choice?.market)} · ${basisName(choice?.basis)}`}
    />
  );
}

/**
 * One side's groups, or a line saying it has none.
 *
 * @param {object} props
 * @param {string} props.noun - What this side prices, for the heading
 * @param {Object<string, {market?: string, basis?: string}>|undefined} props.groups
 */
function SideSection({ noun, groups }) {
  const entries = Object.entries(groups ?? {});

  return (
    <Box>
      <FigureCaption>{noun}</FigureCaption>
      <InsetSurface sx={{ marginTop: 1 }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing set — these are priced against the {noun.toLowerCase()}{" "}
            default above.
          </Typography>
        ) : (
          <Box>
            {entries.map(([groupID, choice]) => (
              <GroupRow
                key={groupID}
                groupID={Number(groupID)}
                choice={choice}
              />
            ))}
          </Box>
        )}
      </InsetSurface>
    </Box>
  );
}

/**
 * What each market group is priced against, per side of a job.
 *
 * A default set here covers everything beneath the group, so pricing minerals
 * once covers every mineral on every job. It sits below the account's own
 * defaults and above nothing: a job that names its own market still wins, and a
 * material's own override wins over that.
 *
 * The two sides are listed apart because that is how they are stored — a group
 * can never answer the side it was not set on, which is the whole reason the
 * table lives inside a side rather than beside one.
 */
function MarketGroupPricing() {
  const defaultPricing = useUsersStore(
    (state) => state.applicationSettings.defaultPricing,
  );
  const { isLoading, isError, error } = useMarketGroupTree();

  return (
    <AppShellPanel
      title="Market group pricing"
      componentName="MarketGroupPricing"
      paperSx={{ height: "auto" }}
      isLoading={isLoading}
      isError={isError}
      error={error}
      loadingMessage="Reading market groups…"
    >
      <Stack spacing={2}>
        {PRICING_SIDES.map(({ side, noun }) => (
          <SideSection
            key={side}
            noun={noun}
            groups={defaultPricing?.[side]?.groups}
          />
        ))}
      </Stack>
    </AppShellPanel>
  );
}

export default MarketGroupPricing;
