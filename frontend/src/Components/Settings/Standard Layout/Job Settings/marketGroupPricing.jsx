import {
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";

import AppShellPanel from "../../../../Styled Components/Paper/AppShellPanel";
import InsetSurface from "../../../../Styled Components/Paper/InsetSurface";
import {
  FigureCaption,
  FigureRow,
} from "../../../../Styled Components/Typography/figures";
import {
  PRICING_SIDE,
  PRICING_SIDES,
} from "../../../../Functions/MarketData/pricingSide";
import ExitRouteSelect from "../../../../Styled Components/Select/exitRoute";
import MarketGroupPicker from "./marketGroupPicker";
import MarketGroupIcon from "../../../../Styled Components/Avatar/MarketGroupIcon";
import { useDialogueTrigger } from "../../../../Styled Components/Dialogue/ContentDialogue";
import GLOBAL_CONFIG from "../../../../global-config-app";

const { DEFAULT_MARKET_OPTION } = GLOBAL_CONFIG;
import {
  useAncestorPath,
  useMarketGroupTree,
} from "../../../../Hooks/Static/useMarketGroups";
import useUsersStore from "../../../../Zustand/usersStore";
import MarketLocationSelect from "../../../../Styled Components/Select/marketLocation";
import MarketListingSelect from "../../../../Styled Components/Select/marketListing";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

/**
 * One group's row: what it is, where it sits, and what it prices against.
 *
 * The path is what makes the name usable — "Minerals" alone does not say whether
 * it is the one the reader meant, and a group set on a container covers
 * everything beneath it.
 *
 * @param {object} props
 * @param {string} props.side - One of PRICING_SIDE
 * @param {number} props.groupID
 * @param {{market?: string, basis?: string}} props.choice
 */
function GroupRow({ side, groupID, choice }) {
  const path = useAncestorPath(groupID);
  const name = path.at(-1)?.name;
  const within = path.slice(0, -1).map((step) => step.name);
  const { updateGroupPricingDefault } = useUsersStore(
    (state) => state.applicationSettings.actions,
  );
  const selling = side === PRICING_SIDE.SELLING;

  const commit = (key, value) => {
    updateGroupPricingDefault(side, groupID, key, value);
    scheduleDebouncedApplicationSettingsSave();
  };

  return (
    <FigureRow
      // A group the published tree no longer carries still has to be visible, or
      // a reader cannot clear what they set.
      label={
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <MarketGroupIcon typeID={path.at(-1)?.iconTypeID} size={20} />
          <span>{name ?? `Group ${groupID}`}</span>
        </Stack>
      }
      sublabel={within.length > 0 ? within.join(" › ") : undefined}
      value={
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <MarketLocationSelect
            useAppShellStyling
            value={choice?.market}
            onChange={(option) => commit("market", option.id)}
            labelText="Market"
            customFormStyling={{ minWidth: 140 }}
          />
          {/* A group answers its own side's axis: output leaves by a route,
              materials are priced on a basis. */}
          {selling ? (
            <ExitRouteSelect
              value={choice?.exit}
              onChange={(option) => commit("exit", option.id)}
              labelText="Sold by"
              customFormStyling={{ minWidth: 180 }}
            />
          ) : (
            <MarketListingSelect
              value={choice?.basis}
              onChange={(option) => commit("basis", option.id)}
              labelText="Prices"
              customFormStyling={{ minWidth: 150 }}
            />
          )}
          <Tooltip title="Stop pricing this group separately" arrow>
            <IconButton
              size="small"
              aria-label={`Remove ${name ?? groupID}`}
              // Clearing both fields is what drops the group: the store treats an
              // entry naming nothing as no entry, so there is no separate remove.
              onClick={() => {
                updateGroupPricingDefault(side, groupID, "market", "");
                updateGroupPricingDefault(
                  side,
                  groupID,
                  selling ? "exit" : "basis",
                  "",
                );
                scheduleDebouncedApplicationSettingsSave();
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      }
    />
  );
}

/**
 * One side's groups, or a line saying it has none.
 *
 * @param {object} props
 * @param {string} props.side - One of PRICING_SIDE
 * @param {string} props.noun - What this side prices, for the heading
 * @param {Object<string, {market?: string, basis?: string}>|undefined} props.groups
 */
function SideSection({ side, noun, groups }) {
  const entries = Object.entries(groups ?? {});
  const picker = useDialogueTrigger();
  const { updateGroupPricingDefault } = useUsersStore(
    (state) => state.applicationSettings.actions,
  );

  // A group starts on the side's own market, which is what it was priced against
  // before: choosing a group is saying "this one is different", and the reader
  // says how it differs with the controls on the row.
  const add = (groupID) => {
    updateGroupPricingDefault(side, groupID, "market", DEFAULT_MARKET_OPTION);
    scheduleDebouncedApplicationSettingsSave();
  };

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <FigureCaption>{noun}</FigureCaption>
        <Button size="small" startIcon={<AddIcon />} onClick={picker.open}>
          Add a group
        </Button>
      </Stack>
      <MarketGroupPicker {...picker.dialogueProps} onChoose={add} noun={noun} />
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
                side={side}
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
            side={side}
            noun={noun}
            groups={defaultPricing?.[side]?.groups}
          />
        ))}
      </Stack>
    </AppShellPanel>
  );
}

export default MarketGroupPricing;
