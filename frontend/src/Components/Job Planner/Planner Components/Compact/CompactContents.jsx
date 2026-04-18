import {
  Card,
  Grid,
  Skeleton,
} from "@mui/material";
import { useMemo } from "react";
import { CompactGroupJobCard } from "./CompactGroupJobCard";
import { CompactJobCardFrame } from "./CompactJobCardFrame";
import uuid from "react-uuid";
import useUsersStore from "../../../../Zustand/usersStore";
import { sortJobSnapshots } from "../utils/jobSnapshotSortingMethods";

export function CompactAccordionContents({
  status,
  skeletonElementsToDisplay,
}) {
  const { groupArray, userJobSnapshot } = useUsersStore((state) => state.jobData);

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
    <Grid container>
      <Grid size={12}>
        {filteredGroups.map((group) => (
          <CompactGroupJobCard key={group.groupID} group={group} />
        ))}
        {filteredAndSortedJobs.map((job) => (
          <CompactJobCardFrame key={job.jobID} job={job} />
        ))}
        {status.id === 0 &&
          Array.from({ length: skeletonElementsToDisplay }).map((_, index) => {
            return (
              <Card
                key={uuid()}
                sx={{
                  marginTop: 0.5,
                  marginBottom: 0.5,
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
            );
          })}
      </Grid>
    </Grid>
  );
}
