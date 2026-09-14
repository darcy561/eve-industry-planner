import { Collapse, Stack, Typography } from "@mui/material";

import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import { calculateChildJobTotals } from "../../../../../../Functions/Groups/childJobTotals";
import useUsersStore from "../../../../../../Zustand/usersStore";
import { ChildJobMaterials } from "./Child Job Drawer/childJobMaterials";
import { ChildJobMaterialTotalCosts } from "./Child Job Drawer/childJobTotalCosts";
import { ChildJobSwitcher } from "./Child Job Drawer/switchChildJob";
import { DisplayMismatchedChildTotals } from "./Child Job Drawer/misMatchedTotals";
import { OpenChildJobButton } from "./Child Job Drawer/openChildJobButton";
import { ImportingStateLayout } from "./Child Job Drawer/fetchState";
import { useChildJobBuildActions } from "./Hooks/useChildJobBuildActions";
import { useChildJobDrawerData } from "./Hooks/useChildJobDrawerData";
import RowPricingOverride from "./rowPricingOverride";

/**
 * What building a material would involve, opened from its row.
 *
 * More than one can be open at once, and each stays with its row while the list
 * scrolls, so a comparison is read against the material it is about.
 *
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {object} props.material
 * @param {object} props.state - Edit Job state
 * @param {object} props.actions - Edit Job actions
 * @param {string} props.marketLocation
 * @param {string} props.listingType
 * @param {number} props.currentMaterialPrice
 * @param {Array<object>} props.matchedChildJobs
 * @param {object} [props.pricing] - Where this row is priced, and how to change it
 * @param {import("../../../../../../Functions/Groups/childJobCoverage").ChildJobCoverage} [props.coverage] -
 *   What the linked jobs produce against what the row needs
 */
export default function MaterialDrawer({
  isOpen,
  material,
  state,
  actions,
  currentMaterialPrice,
  matchedChildJobs,
  marketLocation,
  listingType,
  pricing,
  coverage,
  ...rest
}) {
  const checkTypeIDisExempt = useUsersStore(
    (store) => store.applicationSettings.actions.checkTypeIDisExempt,
  );
  const { buildSingleChildJobPreview } = useChildJobBuildActions({
    state,
    actions,
  });

  const childJobsLocation =
    state.activeJob.build.childJobs[material.typeID] || [];

  const {
    jobImportState,
    jobDisplay,
    setJobDisplay,
    childJobObjects,
    fetchError,
  } = useChildJobDrawerData({
    state,
    isOpen,
    material,
    matchedChildJobs,
    childJobsLocation,
    buildSingleChildJobPreview,
  });

  // The totals follow whichever child job is on show, so they are worked out
  // here rather than handed in with the row.
  const totals = calculateChildJobTotals(
    childJobObjects[jobDisplay],
    state.temporaryChildJobs,
    marketLocation,
    listingType,
  );

  const shared = {
    ...rest,
    state,
    actions,
    material,
    matchedChildJobs,
    marketLocation,
    listingType,
  };

  return (
    <Collapse in={isOpen} timeout="auto" unmountOnExit>
      <InsetSurface sx={{ my: 1 }}>
        {/* A failed cost has to stay on the fetch state: the loaded branch would
            draw a comparison with nothing in it, which reads as a material that
            costs nothing to build rather than one that could not be priced. */}
        {jobImportState && !fetchError ? (
          <Stack spacing={1.5}>
            {pricing ? (
              <RowPricingOverride typeID={material.typeID} {...pricing} />
            ) : null}

            {checkTypeIDisExempt(material.typeID) ? (
              <Typography variant="body2" color="warning.main">
                Marked as exempt from builds.
              </Typography>
            ) : null}

            <ChildJobMaterials
              {...shared}
              childJobObjects={childJobObjects}
              jobDisplay={jobDisplay}
            />
            <ChildJobMaterialTotalCosts
              currentMaterialPrice={currentMaterialPrice}
              totalCostOfMaterials={totals.totalCostOfMaterials}
              totalInstallCosts={totals.totalInstallCosts}
              totalCostPerItem={totals.totalCostPerItem}
            />
            <DisplayMismatchedChildTotals coverage={coverage} />
            <ChildJobSwitcher
              childJobObjects={childJobObjects}
              jobDisplay={jobDisplay}
              setJobDisplay={setJobDisplay}
            />
            {/* Buy or build is decided on the row above, where it can be
                decided without opening anything.

                Only for a job the planner actually holds. Opening a drawer on an
                unbuilt row costs one speculatively so the drawer can show what
                building would take, and that job lives in this page's state
                alone — offering to open it would navigate to a job that is not
                there. */}
            {isRealJob(childJobObjects[jobDisplay], matchedChildJobs) ? (
              <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                <OpenChildJobButton
                  {...shared}
                  childJobObjects={childJobObjects}
                  jobDisplay={jobDisplay}
                />
              </Stack>
            ) : null}
          </Stack>
        ) : (
          <ImportingStateLayout fetchError={fetchError} material={material} />
        )}
      </InsetSurface>
    </Collapse>
  );
}

/**
 * Whether the job on show is one the planner holds, rather than a costing.
 *
 * A drawer opened on a row that is only being considered builds a speculative
 * job to price it. That job carries an id like any other but exists in this
 * page's state alone, so anything offering to navigate to it has to tell the two
 * apart.
 *
 * @param {object|undefined} shown - The job the drawer is displaying
 * @param {Array<object>} matchedChildJobs - The jobs actually linked to this row
 * @returns {boolean}
 */
function isRealJob(shown, matchedChildJobs) {
  if (!shown) return false;
  return matchedChildJobs.some((job) => job.jobID === shown.jobID);
}
