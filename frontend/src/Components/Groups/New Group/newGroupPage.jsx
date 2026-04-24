import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import Group from "../../../Classes/group.js";
import { flushPendingGroupSave } from "../../../Functions/Debounce/jobGroupsPersistSchedule.js";
import { saveJobsViaApi } from "../../../Functions/JobDocuments/saveJobsViaApi.js";
import useUsersStore from "../../../Zustand/usersStore";
import { AppEvent } from "../../../analytics/appEventNames";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import DefaultPageLayout from "../../../Styled Components/defaultPageLayout";
import { LoadingPage } from "../../../Components/loadingPage";

function NewGroupPage() {
  const { jobArray } = useUsersStore((state) => state.jobData);
  const { addGroupToGroupArray } = useUsersStore.getState().jobData.actions;
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const navigate = useNavigate();
  const search = useSearch({ from: "/group/new" });

  useEffect(() => {
    async function retrieveGroupData() {
      const groupJobs = [];
      const jobsToSave = new Set();
      const group = new Group();
      for (let id of jobIDsToInclude) {
        const matchedGroupJob = useUsersStore.getState().jobData.actions.findJobInJobArray(id);
        if (!matchedGroupJob) continue;
        groupJobs.push(matchedGroupJob);
        matchedGroupJob.assignToGroup(group.groupID);

        for (let parentID of matchedGroupJob.parentJobs) {
          if (jobIDsToInclude.includes(parentID)) continue;

          const matchedParentJob = useUsersStore.getState().jobData.actions.findJobInJobArray(parentID);
          if (!matchedParentJob) continue;

          let material =
            matchedParentJob.build.childJobs[matchedGroupJob.jobID];
          if (!material) continue;

          material = material.filter((i) => i !== matchedGroupJob.jobID);
          jobsToSave.add(matchedParentJob.jobID);
        }

        matchedGroupJob.parentJobs = matchedGroupJob.parentJobs.filter((i) =>
          jobIDsToInclude.includes(i)
        );

        for (let material of matchedGroupJob.build.materials) {
          let childJobArray = matchedGroupJob.build.childJobs[material.typeID];
          for (let id of childJobArray) {
            if (jobIDsToInclude.includes(id)) continue;

            const matchedChildJob = useUsersStore.getState().jobData.actions.findJobInJobArray(id);

            if (!matchedChildJob) continue;

            matchedChildJob.parentJobs = matchedChildJob.parentJobs.filter(
              (i) => !matchedGroupJob.jobID
            );
          }
          childJobArray = childJobArray.filter((i) =>
            jobIDsToInclude.includes(i)
          );
          jobsToSave.add(matchedGroupJob.jobID);
        }

        jobsToSave.add(matchedGroupJob.jobID);
      }

      group.createGroup(groupJobs);

      // Includes empty job groups (New Group with no jobs selected → includes query absent/empty).
      trackAppEvent(AppEvent.NEW_JOB_GROUP);

      addGroupToGroupArray(group);




      if (isLoggedIn) {
        await flushPendingGroupSave();
        await saveJobsViaApi(jobArray.filter((i) => jobsToSave.has(i.jobID))
        );
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
      <LoadingPage variant="simple" helperText="Creating group…" />
    </DefaultPageLayout>
  );
}

export default NewGroupPage;
