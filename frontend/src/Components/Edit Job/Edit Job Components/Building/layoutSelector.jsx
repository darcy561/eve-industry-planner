import { Building_StandardLayout_EditJob } from "./StandardLayout/standardLayout";
import useUsersStore from "../../../../Zustand/usersStore";
import useGetAllIndustryJobs from "../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import { useGatherJobMatchesAndUpdateExistingLinkedJobs } from "../../Hooks/useJobMatchesAndWorldData";
import {
  useEsiLinkIntents,
  useJobActions,
  useJobDraft,
} from "../../Edit Job Hooks/useJobDraft";

export function LayoutSelector_EditJob_Building() {
  const actions = useJobActions();
  const itemID = useJobDraft((job) => job.itemID);
  const industryJobs = useJobDraft((job) => job.esi.industryJobs);
  const runsToLink = useEsiLinkIntents("industryJobs");
  const {
    data: allIndustryJobs,
    isLoading,
    isError,
    error: totalErrorObject,
  } = useGetAllIndustryJobs();
  const linkedJobs = useUsersStore((state) => state.account.linkedJobs);

  const {
    jobMatches,
    isWorldDataLoading,
    error: worldDataError,
  } = useGatherJobMatchesAndUpdateExistingLinkedJobs(
    allIndustryJobs,
    itemID,
    industryJobs,
    linkedJobs,
    runsToLink,
    actions.run,
  );

  const totalIsLoading = isLoading || isWorldDataLoading;
  const totalError = isError || worldDataError;

  return (
    <Building_StandardLayout_EditJob
      jobMatches={jobMatches}
      isLoading={totalIsLoading}
      isError={totalError}
      error={totalErrorObject}
    />
  );
}
