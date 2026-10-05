import getSystemIndexes from "../../System Indexes/findSystemIndex";
import useUsersStore from "../../../Zustand/usersStore";
import checkJobTypeIsBuildable from "../../Helper/checkJobTypeIsBuildable";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";
import Setup from "../../../Classes/jobSetup";
import { recalculateSetupMaterials } from "./setups";
import { storeSetup } from "../../../Components/Edit Job/Edit Job Hooks/jobCommands";
import { materialRequirementOf } from "../../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Applies a change to the setup being edited, on a copy, and records it as a
 * command rather than writing into what the page reads.
 *
 * @param {Object} setupObject - The setup as it stands, as a stored row
 * @param {string} name - What the reader did, for the undo step
 * @param {(setup: Setup) => void} change - Makes the change on the copy
 * @param {Object} actions - The edit session's actions
 */
export default async function applySetupChange(
  setupObject,
  name,
  change,
  actions,
) {
  const changed = new Setup(setupObject);
  change(changed);

  const systemIndexResults = await getSystemIndexes(changed.systemID);

  useUsersStore.getState().worldData.actions.addSystemIndex(systemIndexResults);

  actions.run(storeSetup(changed, name));
}

/**
 * Recalculate watchlist setup and dependent buildable material jobs.
 *
 * @param {number|string} requestedTypeID
 * @param {number|string} mainTypeID
 * @param {string} setupID
 * @param {Record<string, Object>} materialObject
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export function recalculateWatchListItemsFromSetup(
  requestedTypeID,
  mainTypeID,
  setupID,
  materialObject,
  queryClient,
) {
  recalculateSetupMaterials(materialObject[requestedTypeID], setupID);

  if (requestedTypeID !== mainTypeID) return;

  const mainJob = materialObject[mainTypeID];
  for (const material of Object.values(mainJob.build.materials)) {
    if (!checkJobTypeIsBuildable(material.jobType)) continue;

    const materialJob = materialObject[material.typeID];
    recalculateJobForNewTotal(
      materialJob,
      materialRequirementOf(mainJob.build.setup, material.typeID),
      queryClient,
    );
  }
}
