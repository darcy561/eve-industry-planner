import { useJobDraft } from "./useJobDraft";
import {
  buildCostOf,
  costOfExtras,
  costOfInstalls,
  costOfInvention,
  costOfMaterials,
  quantityProduced,
} from "./jobSelectors";

/**
 * What the job has cost to build, and what that comes to per item.
 *
 * The parts are named one at a time rather than taken as `build` and `esi`
 * whole, so a child job linked under a material — which lands in the same
 * `build` — leaves a panel reading these alone.
 *
 * @returns {{materialCost: number, installCost: number, extrasCost: number,
 *   inventionCost: number, buildCost: number, produced: number,
 *   costPerItem: number}}
 */
export function useBuildCost() {
  const setups = useJobDraft((job) => job.build.setup);
  const materials = useJobDraft((job) => job.build.materials);
  const extrasCosts = useJobDraft((job) => job.build.extrasCosts);
  const inventionEntries = useJobDraft((job) => job.build.inventionEntries);
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const itemsProducedPerRun = useJobDraft((job) => job.itemsProducedPerRun);

  const buildCost = buildCostOf({
    materials,
    setups,
    industryJobs,
    extrasCosts,
    inventionEntries,
  });
  const produced = quantityProduced(setups, itemsProducedPerRun);

  return {
    materialCost: costOfMaterials(materials, setups),
    installCost: costOfInstalls(industryJobs),
    extrasCost: costOfExtras(extrasCosts),
    inventionCost: costOfInvention(inventionEntries),
    buildCost,
    produced,
    costPerItem: produced ? buildCost / produced : 0,
  };
}
