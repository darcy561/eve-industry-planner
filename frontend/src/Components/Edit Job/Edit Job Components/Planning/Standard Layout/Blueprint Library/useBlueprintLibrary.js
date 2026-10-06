import { useMemo } from "react";
import useBlueprintIndex, {
  BLUEPRINT_SCOPE,
} from "../../../../../../Hooks/EveEsi/useBlueprintIndex";
import useGetAllIndustryJobs from "../../../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import { useJobDraft } from "../../../../Edit Job Hooks/useJobDraft";
import {
  activeJobsByBlueprint,
  blueprintJobState,
} from "../../../../../../Functions/Blueprints/blueprintJobState";

/**
 * The blueprints the reader holds for this job, each with the industry job running on it and what
 * that leaves it, and reaction formulas grouped by who holds them.
 *
 * @returns {{isLoading: boolean, error: Error|null, blueprints: Array<object>, formulaHolders: Array<object>}}
 */
export function useBlueprintLibrary() {
  const blueprintTypeID = useJobDraft((job) => job.blueprintTypeID);
  const index = useBlueprintIndex({ scope: BLUEPRINT_SCOPE.ALL });
  const jobs = useGetAllIndustryJobs();

  const library = useMemo(() => {
    const rows = index.data.byTypeId.get(blueprintTypeID) ?? [];
    const running = activeJobsByBlueprint(
      (jobs.data ?? []).filter(
        (job) => job.blueprint_type_id === blueprintTypeID,
      ),
    );

    const blueprints = rows.map((print) => {
      const esiJob = running.get(print.itemId);
      return {
        print,
        status: blueprintJobState(print, esiJob),
        runsLeft: print.isCopy ? print.runs - (esiJob?.runs ?? 0) : null,
        runningRuns: esiJob?.runs ?? 0,
      };
    });

    const byHolder = new Map();
    for (const row of rows) {
      const holder = byHolder.get(row.ownerId) ?? {
        owner: { kind: row.ownerType, id: row.ownerId },
        formulas: 0,
        running: 0,
      };
      holder.formulas += Math.max(row.originalCount, 1);
      if (running.has(row.itemId)) holder.running += 1;
      byHolder.set(row.ownerId, holder);
    }

    return { blueprints, formulaHolders: [...byHolder.values()] };
  }, [index.data, jobs.data, blueprintTypeID]);

  return {
    isLoading: index.isLoading || jobs.isLoading,
    error: index.error || jobs.error || null,
    ...library,
  };
}
