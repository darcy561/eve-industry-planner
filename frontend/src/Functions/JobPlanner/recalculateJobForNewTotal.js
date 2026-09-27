import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
  setupQuantitiesForTotal,
} from "./setupBuildHelpers";
import { setupToBuildFrom } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors";

/**
 * Recalculates a job for a new total, replacing its setups with a layout that
 * continues from the one being rebuilt.
 *
 * @param {import("../../Classes/job").default} inputJob
 * @param {number} requiredQuantity
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {Object} [options]
 * @param {import("./setupBuildHelpers").CalculateSetupQuantities} [options.calculateSetupQuantities]
 *   How the total is divided into setups. Defaults to the max-run split.
 */
export default function recalculateJobForNewTotal(
  inputJob,
  requiredQuantity,
  queryClient,
  options = {},
) {
  if (!inputJob || !requiredQuantity) return;

  const basedOn = setupToBuildFrom(inputJob);
  const context = buildSetupContextForJob(inputJob, queryClient);
  const setupQuantities = setupQuantitiesForTotal(
    inputJob,
    requiredQuantity,
    queryClient,
    options,
  );

  inputJob.build.setup = {};
  setupQuantities.forEach((setupQuantity, index) => {
    const newSetup = buildSetupFromQuantity(
      inputJob,
      setupQuantity,
      queryClient,
      context,
      { basedOn },
    );
    inputJob.build.setup[newSetup.id] = newSetup;

    if (!index) {
      inputJob.layout.setupToEdit = newSetup.id;
    }
  });
}
