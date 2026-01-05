import { Card, Skeleton, Grid } from "@mui/material";
import { useMemo } from "react";

import { CompactGroupJobCardFrame } from "./CompactGroupJobCardFrame";
import uuid from "react-uuid";
import useUsersStore from "../../../../Zustand/usersStore";
import { sortJobs } from "../utils/jobSortingMethods";

export function CompactGroupAccordionContent({
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

  const displaySkeletons = () =>
    Array.from({ length: skeletonElementsToDisplay }).map((_, index) => (
      <Card
        key={uuid()}
        sx={{
          marginTop: "5px",
          marginBottom: "5px",
          padding: 0,
          height: 40,
        }}
      >
        <Skeleton
          variant="rectangular"
          animation="wave"
          width="100%"
          height="100%"
        />
      </Card>
    ));

  return (
    <Grid container>
      <Grid size={12}>
        {sortedJobs.map((job) => (
          <CompactGroupJobCardFrame
            key={job.jobID}
            job={job}
            skeletonElementsToDisplay={skeletonElementsToDisplay}
            highlightedItems={highlightedItems}
          />
        ))}
        {status.id === 0 && displaySkeletons()}
      </Grid>
    </Grid>
  );
}
