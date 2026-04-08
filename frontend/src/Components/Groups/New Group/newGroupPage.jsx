import { useEffect } from "react";
import { Box } from "@mui/material";
import { useNavigate, useSearch } from "@tanstack/react-router";
import findOrGetJobObject from "../../../Functions/Helper/findJobObject.js";
import Group from "../../../Classes/groupsConstructor.js";
import manageListenerRequests from "../../../Functions/Firebase/manageListenerRequests.js";
import uploadJobSnapshotsToFirebase from "../../../Functions/Firebase/uploadJobSnapshots.js";
import uploadGroupsToFirebase from "../../../Functions/Firebase/uploadGroupData.js";
import firebaseBatchUpdateJobs from "../../../Functions/Firebase/batchUpdateJobs.js";
import useUsersStore from "../../../Zustand/usersStore";
import DefaultPageLayout from "../../../Styled Components/defaultPageLayout";
import { LoadingPage } from "../../../Components/loadingPage";

function NewGroupPage() {
  const { groupArray, userJobSnapshot, jobArray } = useUsersStore(
    (state) => state.jobData
  );
  const {
    addGroupToGroupArray,
    replaceUserJobSnapshotArray,
    addRetrievedJobsToJobArray,
  } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.users.isLoggedIn);
  const navigate = useNavigate();
  const search = useSearch({ from: "/group/new" });

  useEffect(() => {
    async function retrieveGroupData() {
      const groupJobs = [];
      const retrievedJobs = [];
      const jobsToSave = new Set();
      let newUserJobSnapshot = [...userJobSnapshot];
      const group = new Group();
      for (let id of jobIDsToInclude) {
        const matchedGroupJob = await findOrGetJobObject(id, retrievedJobs);
        if (!matchedGroupJob) continue;
        groupJobs.push(matchedGroupJob);
        matchedGroupJob.groupID = group.groupID;

        for (let parentID of matchedGroupJob.parentJob) {
          if (jobIDsToInclude.includes(parentID)) continue;

          const matchedParentJob = await findOrGetJobObject(
            parentID,
            retrievedJobs
          );
          if (!matchedParentJob) continue;

          let material =
            matchedParentJob.build.childJobs[matchedGroupJob.jobID];
          if (!material) continue;

          material = material.filter((i) => i !== matchedGroupJob.jobID);
          jobsToSave.add(matchedParentJob.jobID);
        }

        matchedGroupJob.parentJob = matchedGroupJob.parentJob.filter((i) =>
          jobIDsToInclude.includes(i)
        );

        for (let material of matchedGroupJob.build.materials) {
          let childJobArray = matchedGroupJob.build.childJobs[material.typeID];
          for (let id of childJobArray) {
            if (jobIDsToInclude.includes(id)) continue;

            const matchedChildJob = await findOrGetJobObject(id, retrievedJobs);

            if (!matchedChildJob) continue;

            matchedChildJob.parentJob = matchedChildJob.parentJob.filter(
              (i) => !matchedGroupJob.jobID
            );
          }
          childJobArray = childJobArray.filter((i) =>
            jobIDsToInclude.includes(i)
          );
          jobsToSave.add(matchedGroupJob.jobID);
        }

        newUserJobSnapshot = newUserJobSnapshot.filter(
          (i) => i.jobID !== matchedGroupJob.jobID
        );
        jobsToSave.add(matchedGroupJob.jobID);
      }

      group.createGroup(groupJobs);

      replaceUserJobSnapshotArray(newUserJobSnapshot);
      addRetrievedJobsToJobArray(retrievedJobs);
      addGroupToGroupArray(group);

      manageListenerRequests(jobIDsToInclude);

      if (isLoggedIn) {
        await uploadJobSnapshotsToFirebase(newUserJobSnapshot);
        await uploadGroupsToFirebase();
        const combinedJobs = [];
        for (let id of [...jobsToSave]) {
          let job = [...jobArray, ...retrievedJobs].find((i) => i.jobID === id);
          if (!job) {
            return;
          }
          combinedJobs.push(job);
        }
        await firebaseBatchUpdateJobs(combinedJobs);
      }

      await Promise.race([checkJobsPresent(), timeout()]);
      navigate({
        to: "/group/$groupID",
        params: { groupID: group.groupID },
      });
    }

    function checkJobsPresent() {
      return new Promise((res, _) => {
        const intervalID = setInterval(() => {
          const allJobsFound = jobIDsToInclude.every((id) =>
            jobArray.some((i) => i.jobID === id)
          );
          if (allJobsFound) {
            clearInterval(intervalID);
            res(true);
          }
        }, 1000);

        return () => clearInterval(intervalID);
      });
    }

    function timeout() {
      return new Promise((res, rej) => {
        setTimeout(() => {
          rej(new Error("timeout"));
        }, 10000);
      });
    }

    const jobIDsToInclude = search.includes?.split(",").filter(Boolean) || [];

    retrieveGroupData().catch((err) => {
      console.error(err.message);
      navigate({ to: "/jobplanner" });
    });
  }, []);

  return (
    <DefaultPageLayout>
      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <LoadingPage />
      </Box>
    </DefaultPageLayout>
  );
}

export default NewGroupPage;
