import getSystemIndexes from "../System Indexes/findSystemIndex";
import useUsersStore from "../../Zustand/usersStore";
import checkJobTypeIsBuildable from "../Helper/checkJobTypeIsBuildable";
import recalculateJobForNewTotal from "./recalculateJobForNewTotal";
import Setup from "../../Classes/jobSetup";
import { storeSetup } from "../../Components/Edit Job/Edit Job Hooks/jobCommands";

/**
 * Applies a change to the setup being edited and works the job out again.
 *
 * The change is made on a copy: the job the page reads is a view of what the
 * session holds, so changing it in place reaches nothing. The copy is also what
 * says which system the indexes are wanted for, which the change may have moved.
 *
 * @param {Object} setupObject - The setup as it stands
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
  const changed = new Setup(
    typeof setupObject?.toDocument === "function"
      ? setupObject.toDocument()
      : setupObject,
  );
  change(changed);

  const systemIndexResults = await getSystemIndexes(changed.systemID);

  // The index lands before the job does: install costs are worked out while
  // rendering, and a job shown against an index the store has not been given
  // yet is costed at zero.
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
  materialObject[requestedTypeID].recalculateSelectedSetup(setupID);

  if (requestedTypeID !== mainTypeID) return;

  const mainJob = materialObject[mainTypeID];
  for (const material of Object.values(mainJob.build.materials)) {
    if (!checkJobTypeIsBuildable(material.jobType)) continue;

    const materialJob = materialObject[material.typeID];
    recalculateJobForNewTotal(materialJob, material.quantity, queryClient);
  }
}
