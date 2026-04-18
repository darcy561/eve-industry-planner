import { Skeleton, Grid } from "@mui/material";
import { useMemo } from "react";

import { JobCardFrame } from "./ClassicJobCardFrame";
import { ClassicGroupJobCard } from "./ClassicGroupJobCard";
import uuid from "react-uuid";
import useUsersStore from "../../../../Zustand/usersStore";
import { sortJobSnapshots } from "../utils/jobSnapshotSortingMethods";

export function ClassicAccordionContents({
  status,
  skeletonElementsToDisplay,
}) {
  const { groupArray, userJobSnapshot } = useUsersStore(
    (state) => state.jobData
  );

  // Filter and sort jobs by status for better performance
  const filteredAndSortedJobs = useMemo(() => {
    const filteredJobs = userJobSnapshot.filter(
      (job) => Number(job.jobStatus) === Number(status.id)
    );
    return sortJobSnapshots(filteredJobs, status.id);
  }, [userJobSnapshot, status.id]);

  // Filter groups by status (groups remain unsorted)
  const filteredGroups = useMemo(() => {
    return groupArray.filter(
      (group) => Number(group.groupStatus) === Number(status.id)
    );
  }, [groupArray, status.id]);

  return (
    <Grid container spacing={2} sx={{ height: "100%" }} size={12}>
      {filteredGroups.map((group) => (
        <ClassicGroupJobCard key={group.groupID} group={group} />
      ))}
      {filteredAndSortedJobs.map((job) => (
        <JobCardFrame key={job.jobID} job={job} />
      ))}
      {status.id === 0 &&
        Array.from({ length: skeletonElementsToDisplay }).map((_, index) => {
          return (
            <Grid
              key={uuid()}
              sx={{ minHeight: 200, width: "100%" }}
              size={{
                xs: 12,
                sm: 6,
                md: 4,
                lg: 3,
              }}
            >
              <Skeleton
                variant="rectangular"
                animation="wave"
                width="100%"
                height="100%"
              />
            </Grid>
          );
        })}
    </Grid>
  );
}
