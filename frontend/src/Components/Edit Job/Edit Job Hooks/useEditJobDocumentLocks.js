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
  });

  useDocumentLock(
    USER_JOB_GROUPS_COLLECTION,
    activeGroupID ?? "",
    groupLockReady,
    {
      pendingAccessRequestMessage:
        "Another tab requested edit access for this group.",
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
