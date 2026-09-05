import {
  buildSetupContextForJob,
  buildSetupFromQuantity,
} from "./setupBuildHelpers";

/**
 * Recalculates a job for a new total production quantity.
 *
 * @param {Object} inputJob
 * @param {number} requiredQuantity
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 */
export default function recalculateJobForNewTotal(
  inputJob,
  requiredQuantity,
  queryClient
) {
  if (!inputJob || !requiredQuantity) return;

  const context = buildSetupContextForJob(inputJob, requiredQuantity, queryClient);

  inputJob.build.setup = {};
  context.setupQuantities.forEach((setupQuantity, index) => {
    const newSetup = buildSetupFromQuantity(
      inputJob,
      setupQuantity,
      queryClient,
      context
    );
    inputJob.build.setup[newSetup.id] = newSetup;

    if (!index) {
      inputJob.layout.setupToEdit = newSetup.id;
    }
  });

}
