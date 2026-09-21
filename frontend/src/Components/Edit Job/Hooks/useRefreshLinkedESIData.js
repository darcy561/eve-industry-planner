import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getAllCachedCharacterMarketOrders } from "../../../Hooks/EveEsi/Character/useGetAllCharacterMarketOrders";
import { getAllCachedCorporationMarketOrders } from "../../../Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders";
import { getCachedAllIndustryJobs } from "../../../Hooks/EveEsi/useGetAllIndustryJobs";
import {
  refreshLinkedMarketOrders,
  updateLinkedJobData,
} from "../Edit Job Hooks/jobCommands";

/**
 * Brings a job's linked ESI rows up to date as it is opened.
 *
 * Linked runs and orders were only refreshed by the Building and Selling tabs,
 * so a job the user opened and archived without visiting them kept whatever ESI
 * last said — and once archived, nothing corrects it again.
 *
 * It reads the query cache rather than fetching: the dashboard already loads
 * this data, so an open costs nothing, and a cold cache simply leaves the job
 * for the tabs to refresh.
 *
 * @param {string|undefined} jobID - The job the editor is holding
 * @param {(command: {name: string, recipe: Function}) => void} run
 */
export function useRefreshLinkedESIData(jobID, run) {
  const queryClient = useQueryClient();
  const refreshedJobID = useRef(null);

  useEffect(() => {
    if (!jobID) return;
    if (refreshedJobID.current === jobID) return;
    refreshedJobID.current = jobID;

    const { data: characterOrders, isLoading: charactersLoading } =
      getAllCachedCharacterMarketOrders(queryClient);
    const { data: corporationOrders, isLoading: corporationsLoading } =
      getAllCachedCorporationMarketOrders(queryClient);
    const { data: industryJobs, isLoading: jobsLoading } =
      getCachedAllIndustryJobs(queryClient);

    // A command that changes nothing records nothing, so neither refresh needs
    // asking whether it moved anything.
    if (!charactersLoading && !corporationsLoading) {
      run(
        refreshLinkedMarketOrders([
          ...Object.values(characterOrders || {}).flat(),
          ...Object.values(corporationOrders || {}).flat(),
        ]),
      );
    }

    if (!jobsLoading && industryJobs?.length) {
      run(updateLinkedJobData(industryJobs));
    }
  }, [jobID, queryClient, run]);
}

export default useRefreshLinkedESIData;
