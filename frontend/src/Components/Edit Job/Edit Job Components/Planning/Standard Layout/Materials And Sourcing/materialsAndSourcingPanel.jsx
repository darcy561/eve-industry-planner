import { useEffect, useRef, useState } from "react";
import {
  MenuItem,
  Select,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import AppShellPanel from "../../../../../../Styled Components/Paper/AppShellPanel";
import PricingBasisSelect from "../../../../../../Styled Components/Select/pricingBasis";
import { MarketLocationSelectApplicationSettings } from "../../../../../../Styled Components/Select/marketLocation";
import writeTextToClipboard from "../../../../../../Functions/Clipboard/writeTextToClipboard";
import {
  formatIsk,
  formatNumberForLocale,
} from "../../../../../../Functions/Helper/numberParser";
import MaterialDrawer from "./materialDrawer";
import PlanChip from "./planChip";
import MaterialsTable from "./materialsTable";
import MaterialCards from "./materialCards";
import { SourcingFooter, SourcingOffer } from "./sourcingSummary";
import { useMaterialsSourcing } from "./useMaterialsSourcing";
import { useMaterialOverrides } from "./Hooks/useMaterialOverrides";
import { getSafeMaterialPriceOverrides } from "./Helpers/materialPriceOverridesState";
import { useChildJobBuildActions } from "./Hooks/useChildJobBuildActions";
import { finaliseCreatedChildJobs } from "./Helpers/finaliseCreatedChildJobs";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { hasSavingAvailable } from "../../../../../../Functions/MarketData/materialSourcingRow";
import { PRICING_SIDE } from "../../../../../../Functions/MarketData/pricingSide.js";

/**
 * What the build takes, and whether each part is bought or built.
 *
 * One row per material, stating the quantity, both prices and which of them the
 * plan is on — so the list exists once and the comparison is on it.
 *
 * @param {object} props
 * @param {object} props.state - Edit Job state
 * @param {object} props.actions - Edit Job actions
 */
export default function MaterialsAndSourcingPanel({ state, actions }) {
  const [displayType, setDisplayType] = useState("all");
  const [openTypeIDs, setOpenTypeIDs] = useState([]);
  const [isCosting, setIsCosting] = useState(false);
  // Set while a request is in flight and left set once one succeeds, so the rows
  // the pricing could not answer for are not asked about again on every render
  // that still finds them uncosted. A failure clears it, and the attempt count
  // beside it is what gives the effect a reason to run again.
  const costingRef = useRef(false);
  const [attempt, setAttempt] = useState(0);

  // The job's own lock, the way every other panel on the page gates its
  // actions: a job someone else holds is read from, not edited.
  const readOnly = useActiveJobReadOnly(state);
  // A seven-column table cannot survive a 360px stack; the figures can.
  const theme = useTheme();
  const asCards = useMediaQuery(theme.breakpoints.down("sm"));
  const MaterialsList = asCards ? MaterialCards : MaterialsTable;

  const {
    rows,
    summary,
    basisOptions,
    basisUsage,
    priceAge,
    marketLocation,
    listingType,
  } = useMaterialsSourcing({ state, actions, displayType });

  const {
    updateJobPricing,
    updateMaterialLayoutPreference,
    resetMaterialLayoutPreference,
    clearAllMaterialLayoutPreferences,
  } = useMaterialOverrides({
    activeJob: state.activeJob,
    layout: state.activeJob.layout,
    materials: state.activeJob.build?.materials ?? [],
    updateActiveJob: actions.updateActiveJob,
  });

  const { buildSpeculativeChildJobs, buildSingleChildJobPreview } =
    useChildJobBuildActions({
      state,
      actions,
    });

  // Buildable rows with nothing to compare against yet, taken from the summary
  // so the banner and the footer cannot disagree about what counts as buildable.
  const uncosted = summary.buildable - summary.costed;

  // Costing every buildable row is two batched requests and writes nothing
  // outside this page, so it is not worth asking permission for — the rows that
  // have a build price and the rows that do not looked the same, and a reader
  // could not tell "cannot be built" from "nobody has worked it out yet".
  //
  // An effect because it reaches the network: it runs once the panel is being
  // looked at rather than during the render that shows it, so the table paints
  // with its Build column pending and fills in.
  useEffect(() => {
    if (readOnly || uncosted <= 0 || costingRef.current) return;

    let live = true;
    costingRef.current = true;
    setIsCosting(true);

    buildSpeculativeChildJobs()
      .catch((error) => {
        // A failed attempt is not an answer: the guard comes off and the
        // attempt is counted, which is what gives this effect a reason to run
        // again. Left set, a transient ESI failure would stand the panel down
        // for the rest of the visit — and there is no control to ask with any
        // more.
        costingRef.current = false;
        console.warn("Pricing the buildable rows failed", error);
        if (live) setAttempt((previous) => previous + 1);
      })
      .finally(() => {
        if (live) setIsCosting(false);
      });

    return () => {
      live = false;
    };
  }, [readOnly, uncosted, attempt, buildSpeculativeChildJobs]);

  if (!state.activeJob?.selectedSetup) return null;

  /**
   * Promotes every costed row that would be cheaper to build. The speculative
   * jobs already exist and are already hydrated, so this commits the objects
   * rather than building them again.
   */
  const applyBuildableRows = async () => {
    const jobs = rows
      .filter(hasSavingAvailable)
      .map((row) => state.speculativeChildJobs?.[row.typeID])
      .filter(Boolean);

    if (jobs.length === 0) return;

    await finaliseCreatedChildJobs({
      jobsForMissingDataAndRecalc: [],
      jobsToMarkForAddition: jobs,
      actions,
    });

    // Committing moves them to the temporary map, and a row reads that first —
    // a copy left here would be offered again after an unlink.
    actions.forgetSpeculativeChildJobs(jobs.map((job) => job.itemID));
  };

  // The basis every row is priced on unless it carries an override of its own.
  const changeBasis = (basisID) =>
    updateJobPricing(PRICING_SIDE.BUYING, "basis", basisID);

  const toggleRow = (typeID) =>
    setOpenTypeIDs((open) =>
      open.includes(typeID)
        ? open.filter((id) => id !== typeID)
        : [...open, typeID],
    );

  // Shown rather than toggled: a row built from its own control has something
  // new to look at, and closing it would be the opposite of what was asked.
  const openRow = (typeID) =>
    setOpenTypeIDs((open) =>
      open.includes(typeID) ? open : [...open, typeID],
    );

  return (
    <AppShellPanel
      title="Materials & Sourcing"
      componentName="MaterialsAndSourcingPanel"
      // AppShellPanel fills its parent by default, which is meant for panels
      // sharing a grid row. These are stacked, so each takes its own height.
      paperSx={{ height: "auto" }}
      action={
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-end" }}>
          <MarketLocationSelectApplicationSettings
            side={PRICING_SIDE.BUYING}
            overrideMarketLocation={
              state.activeJob.layout.localPricing?.buying?.market
            }
            onMarketLocationCommit={(id) =>
              updateJobPricing(PRICING_SIDE.BUYING, "market", id ?? null)
            }
            labelText="Hub"
            disabled={readOnly}
            customFormStyling={{ minWidth: 120 }}
          />
          <PricingBasisSelect
            options={basisOptions}
            formatValue={formatIsk}
            label="Materials"
            usage={basisUsage}
            age={priceAge}
            onChange={changeBasis}
            onReset={clearAllMaterialLayoutPreferences}
            disabled={readOnly}
          />
        </Stack>
      }
      enableMenu
      menuItems={[
        {
          label: "Copy Resources List",
          onClick: () => writeTextToClipboard(resourceListText(rows)),
        },
      ]}
    >
      <Stack spacing={1.5}>
        <Select
          variant="standard"
          size="small"
          value={displayType}
          onChange={(event) => setDisplayType(event.target.value)}
          sx={{ alignSelf: "flex-start" }}
          inputProps={{ "aria-label": "Which requirement to show" }}
        >
          <MenuItem value="all">Total Job</MenuItem>
          <MenuItem value="active">Selected Setup</MenuItem>
        </Select>

        <SourcingOffer
          summary={summary}
          formatIsk={formatIsk}
          onApply={applyBuildableRows}
          disabled={readOnly}
        />

        <MaterialsList
          rows={rows}
          isCosting={isCosting}
          formatIsk={formatIsk}
          formatQuantity={formatQuantity}
          onToggleRow={toggleRow}
          openTypeIDs={openTypeIDs}
          // The decision belongs to the row, not to the drawer beneath it: a
          // costed row can be confirmed from the list, and the drawer is for
          // reading what building it would take.
          renderPlan={(row) =>
            row.isBuildable ? (
              <PlanChip
                state={state}
                actions={actions}
                material={row.material}
                rowJob={
                  state.speculativeChildJobs?.[row.typeID] ??
                  row.matchedChildJobs?.[0] ??
                  null
                }
                costRow={() =>
                  buildSingleChildJobPreview({ material: row.material })
                }
                onBuilt={() => openRow(row.typeID)}
              />
            ) : null
          }
          renderDrawer={(row, isOpen) => (
            <MaterialDrawer
              isOpen={isOpen}
              state={state}
              actions={actions}
              material={row.material}
              matchedChildJobs={row.matchedChildJobs}
              marketLocation={row.marketLocation}
              listingType={row.listingType}
              currentMaterialPrice={row.buyPrice ?? 0}
              coverage={row.coverage}
              pricing={{
                overrideMarket: overrideFor(state, row.typeID).marketDisplay,
                overrideListing: overrideFor(state, row.typeID).orderDisplay,
                panelMarket: marketLocation,
                panelListing: listingType,
                onMarketCommit: (typeID, id) =>
                  updateMaterialLayoutPreference(typeID, "marketDisplay", id),
                onListingCommit: (typeID, id) =>
                  updateMaterialLayoutPreference(typeID, "orderDisplay", id),
                onReset: resetMaterialLayoutPreference,
                disabled: readOnly,
              }}
            />
          )}
        />

        <SourcingFooter summary={summary} formatVolume={formatVolume} />
      </Stack>
    </AppShellPanel>
  );
}

/** A count of items, which is never fractional. */
const formatQuantity = (value) => formatNumberForLocale(value, { max: 0 });

/** Volume, as Raw Resources stated it. */
const formatVolume = (value) =>
  `${formatNumberForLocale(value, { max: 0 })} m3`;

/**
 * What a material's own pricing override holds, if it has one.
 *
 * @param {object} state
 * @param {number} typeID
 * @returns {{marketDisplay?: string, orderDisplay?: string}}
 */
function overrideFor(state, typeID) {
  return getSafeMaterialPriceOverrides(state.activeJob.layout)[typeID] ?? {};
}

/**
 * The list as a player pastes it into the game, one material and quantity a line.
 *
 * @param {import("../../../../../../Functions/MarketData/materialSourcingRow").MaterialSourcingRow[]} rows
 * @returns {string}
 */
function resourceListText(rows) {
  return rows.map((row) => `${row.name} ${row.quantity}`).join("\n") + "\n";
}

export { resourceListText };
