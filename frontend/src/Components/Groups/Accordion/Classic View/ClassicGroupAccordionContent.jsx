import { Skeleton, Grid } from "@mui/material";
import { useMemo } from "react";

import { ClassicGroupJobCardFrame } from "./ClassicGroupJobCardFrame";
import uuid from "react-uuid";
import useUsersStore from "../../../../Zustand/usersStore";
import { sortJobs } from "../utils/jobSortingMethods";

export function ClassicGroupAccordionContent({
  status,
  statusJobs,
  skeletonElementsToDisplay,
  highlightedItems,
}) {
  const { getActiveGroupObject } = useUsersStore.getState().jobData.actions;

  const activeGroupObject = getActiveGroupObject();

  const shouldJobBeDisplayed = (job) => {
    if (!activeGroupObject) return false;

    return (
      activeGroupObject.showComplete ||
      !activeGroupObject.areComplete.has(job.jobID)
    );
  };

  // Memoized sorted jobs array using dependency injection sorting system
  const sortedJobs = useMemo(() => {
    const filteredJobs = statusJobs.filter(shouldJobBeDisplayed);
    return sortJobs(filteredJobs, status.id);
  }, [statusJobs, activeGroupObject, status.id]);

  return (
    <Grid container spacing={2} sx={{ height: "100%" }} size={12}>
      {sortedJobs.map((job) => (
        <ClassicGroupJobCardFrame
          key={job.jobID}
          job={job}
          highlightedItems={highlightedItems}
        />
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
                lg: 3
              }}>
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
