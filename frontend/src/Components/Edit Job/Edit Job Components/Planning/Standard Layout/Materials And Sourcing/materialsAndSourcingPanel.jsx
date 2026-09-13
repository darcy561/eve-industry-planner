import { useState } from "react";
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
import {
  SourcingCostOffer,
  SourcingFooter,
  SourcingOffer,
} from "./sourcingSummary";
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
    marketSelect,
    listingSelect,
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

  if (!state.activeJob?.selectedSetup) return null;

  // Buildable rows with nothing to compare against yet. A row already linked has
  // a real build cost, so it is not waiting on anything.
  const uncosted = rows.filter(
    (row) => row.isBuildable && row.buildPrice === null,
  ).length;

  const costBuildableRows = async () => {
    setIsCosting(true);
    try {
      await buildSpeculativeChildJobs();
    } finally {
      setIsCosting(false);
    }
  };

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

        <SourcingCostOffer
          summary={summary}
          uncosted={uncosted}
          onCost={costBuildableRows}
          isCosting={isCosting}
          disabled={readOnly}
        />

        <SourcingOffer
          summary={summary}
          formatIsk={formatIsk}
          onApply={applyBuildableRows}
          disabled={readOnly}
        />

        <MaterialsList
          rows={rows}
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
              marketSelect={row.marketSelect}
              listingSelect={row.listingSelect}
              currentMaterialPrice={row.buyPrice ?? 0}
              coverage={row.coverage}
              pricing={{
                overrideMarket: overrideFor(state, row.typeID).marketDisplay,
                overrideListing: overrideFor(state, row.typeID).orderDisplay,
                panelMarket: marketSelect,
                panelListing: listingSelect,
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
