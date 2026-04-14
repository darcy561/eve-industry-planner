import { useMediaQuery } from "@mui/material";
import { Building_StandardLayout_EditJob } from "./StandardLayout/standardLayout";
import useUsersStore from "../../../../Zustand/usersStore";
import useGetAllIndustryJobs from "../../../../Hooks/EveEsi/useGetAllIndustryJobs";
import { useGatherJobMatchesAndUpdateExistingLinkedJobs } from "../../../../Hooks/useJobMatchesAndWorldData";

export function LayoutSelector_EditJob_Building(props) {
  const { state } = props;
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const { data: allIndustryJobs, isLoading, isError, error: totalErrorObject } = useGetAllIndustryJobs();
  const linkedJobs = useUsersStore((state) => state.account.linkedJobs);

  const {
    jobMatches,
    isWorldDataLoading,
    error: worldDataError,
  } = useGatherJobMatchesAndUpdateExistingLinkedJobs(
    allIndustryJobs,
    state.activeJob,
    linkedJobs,
    state.esiDataToLink
  );

  const totalIsLoading = isLoading || isWorldDataLoading;
  const totalError = isError || worldDataError;

  switch (deviceNotMobile) {
    case true:
      return (
        <Building_StandardLayout_EditJob
          {...props}
          jobMatches={jobMatches}
          isLoading={totalIsLoading}
          isError={totalError}
          error={totalErrorObject}
        />
      );
    case false:
      return (
        <Building_StandardLayout_EditJob
          {...props}
          jobMatches={jobMatches}
          isLoading={totalIsLoading}
          isError={totalError}
          error={totalErrorObject}
        />
      );
    default:
      return (
        <Building_StandardLayout_EditJob
          {...props}
          jobMatches={jobMatches}
          isLoading={totalIsLoading}
          isError={totalError}
          error={totalErrorObject}
        />
      );
  }
}
