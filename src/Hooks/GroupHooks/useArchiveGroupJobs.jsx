import { getAnalytics, logEvent } from "firebase/analytics";
import { useContext } from "react";
import {
  FirebaseListenersContext,
  IsLoggedInContext,
  UserJobSnapshotContext,
  UsersContext,
} from "../../Context/AuthContext";
import { ActiveJobContext, JobArrayContext } from "../../Context/JobContext";
import { useFirebase } from "../useFirebase";
import { useHelperFunction } from "../GeneralHooks/useHelperFunctions";
import uploadGroupsToFirebase from "../../Functions/Firebase/uploadGroupData";
import deleteJobFromFirebase from "../../Functions/Firebase/deleteJob";
import archiveJobInFirebase from "../../Functions/Firebase/archiveJob";
import closeFirebaseListeners from "../../Functions/Firebase/closeListenerRequests";
import { useNavigate } from "react-router-dom";

export function useArchiveGroupJobs() {
  const { users, updateUsers } = useContext(UsersContext);
  const { activeGroup, updateActiveGroup } = useContext(ActiveJobContext);
  const { jobArray, groupArray, updateGroupArray, updateJobArray } =
    useContext(JobArrayContext);
  const { userJobSnapshot } = useContext(UserJobSnapshotContext);
  const { isLoggedIn } = useContext(IsLoggedInContext);
  const { firebaseListeners, updateFirebaseListeners } = useContext(
    FirebaseListenersContext
  );
  const { updateMainUserDoc } = useFirebase();
  const { sendSnackbarNotificationSuccess } = useHelperFunction();
  const analytics = getAnalytics();
  const navigate = useNavigate();

  const archiveGroupJobs = async (selectedJobs) => {
    const { groupID, groupName } = groupArray.find(
      (i) => i.groupID === activeGroup
    );
    let newUserArray = [...users];
    let parentUserIndex = newUserArray.findIndex((i) => i.ParentUser);
    let newLinkedOrders = new Set(newUserArray[parentUserIndex].linkedOrders);
    let newLinkedTrans = new Set(newUserArray[parentUserIndex].linkedTrans);
    let newLinkedJobs = new Set(newUserArray[parentUserIndex].linkedJobs);

    const filteredJobs = selectedJobs.filter(
      (job) => !userJobSnapshot.some((i) => i.jobID === job.jobID)
    );

    logEvent(analytics, "Archive Group Jobs", {
      UID: newUserArray[parentUserIndex].accountID,
      groupID: groupID,
      groupSize: filteredJobs.length,
    });

    for (let selectedJob of filteredJobs) {
      newLinkedOrders = new Set([...newLinkedOrders], selectedJob.apiOrders);
      newLinkedTrans = new Set([...newLinkedTrans], selectedJob.linkedTrans);
      newLinkedJobs = new Set([...newLinkedJobs], selectedJob.linkedJobs);
    }

    let newJobArray = jobArray.filter(
      (i) =>
        selectedJobs.some((z) => z.jobID === i.jobID) &&
        !userJobSnapshot.some((x) => x.job === i.jobID)
    );

    let newGroupArray = groupArray.filter((i) => i.groupID !== activeGroup);

    updateActiveGroup(null);
    updateUsers(newUserArray);
    updateGroupArray(newGroupArray);
    updateJobArray(newJobArray);
    if (isLoggedIn) {
      for (let selectedJob of filteredJobs) {
        await archiveJobInFirebase(selectedJob);
        await deleteJobFromFirebase(selectedJob);
      }
      closeFirebaseListeners(
        filteredJobs,
        firebaseListeners,
        updateFirebaseListeners,
        isLoggedIn
      );
      await uploadGroupsToFirebase(newGroupArray);
      await updateMainUserDoc();
    }
    sendSnackbarNotificationSuccess(`${groupName} Archived`, 3);
  };

  return {
    archiveGroupJobs,
  };
}
0;
