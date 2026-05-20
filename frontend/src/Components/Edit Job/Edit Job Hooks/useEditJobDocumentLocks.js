import { useMemo } from "react";
import useUsersStore from "../../../Zustand/usersStore";
import { useDocumentLock } from "../../../Hooks/DocumentLock/useDocumentLock.js";
import { useRegisterHeaderDocumentLockUI } from "../../../Hooks/DocumentLock/useRegisterHeaderDocumentLockUI.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../../../Functions/DocumentLock/documentLockCollections.js";

export function useEditJobDocumentLocks({ jobID, activeJob, isLoading }) {
  const isLoggedIn = useUsersStore((s) => s.account.isLoggedIn);
  const activeGroupID = useUsersStore((s) => s.jobData.activeGroupID);

  const documentLockReady = Boolean(
    isLoggedIn &&
      jobID &&
      activeJob &&
      activeJob.jobID === jobID &&
      !isLoading
  );

  const groupLockReady = Boolean(
    documentLockReady &&
      activeGroupID &&
      activeJob?.groupID === activeGroupID
  );

  useDocumentLock(USER_JOBS_COLLECTION, jobID ?? "", documentLockReady, {
    pendingAccessRequestMessage:
      "Another tab requested edit access for this job.",
    becameOwnerVacantMessage:
      "You now hold the edit lock for this job — this tab is the editor.",
    lostOwnerMessage:
      "This tab is now read-only for this job — another session holds the edit lock.",
    extendNudgeMessage:
      "This job's edit session is about to end — renew now while this tab is visible.",
    passiveViewerMessage: (count) =>
      count === 1
        ? "Another session is viewing this job — you still hold the edit lock."
        : `${count} other sessions are viewing this job — you still hold the edit lock.`,
  });

  useDocumentLock(
    USER_JOB_GROUPS_COLLECTION,
    activeGroupID ?? "",
    groupLockReady,
    {
      pendingAccessRequestMessage:
        "Another tab requested edit access for this group.",
      becameOwnerVacantMessage:
        "You now hold the edit lock for this group — this tab is the editor.",
      lostOwnerMessage:
        "This tab is now read-only for this group — another session holds the edit lock.",
      extendNudgeMessage:
        "This group's edit session is about to end — renew now while this tab is visible.",
      passiveViewerMessage: (count) =>
        count === 1
          ? "Another session is viewing this group — you still hold the edit lock."
          : `${count} other sessions are viewing this group — you still hold the edit lock.`,
    }
  );

  const headerLockRegistrations = useMemo(() => {
    const jobReg = {
      collection: USER_JOBS_COLLECTION,
      docID: jobID ?? "",
      enabled: documentLockReady,
      label: "Job",
      readOnlyMessage:
        "This job is being edited in another session (read-only).",
      treeOwnership: "full",
    };

    if (!groupLockReady || !activeGroupID) {
      return [jobReg];
    }

    return [
      jobReg,
      {
        collection: USER_JOB_GROUPS_COLLECTION,
        docID: activeGroupID,
        enabled: documentLockReady,
        label: "Group",
        readOnlyMessage:
          "This group is being edited in another session (read-only).",
        treeOwnership: "limited",
      },
    ];
  }, [activeGroupID, documentLockReady, groupLockReady, jobID]);

  useRegisterHeaderDocumentLockUI({
    registrations: headerLockRegistrations,
  });
}
