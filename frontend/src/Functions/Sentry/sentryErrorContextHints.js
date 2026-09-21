import useUsersStore from "../../Zustand/usersStore";
import { jobDraftNow } from "../../Components/Edit Job/Edit Job Hooks/useJobDraft";
import { hasChanges } from "../../Components/Edit Job/Edit Job Hooks/jobDraftStore";

/**
 * Small JSON-safe hints for Sentry `extra` fields. Avoid attaching full Zustand
 * slices or edit-job state — `captureException` walks and normalises `extra`,
 * which blocked the main thread when those objects were large.
 */
export function getSentryUsersStoreContextHints() {
  const st = useUsersStore.getState();
  const { users, applicationSettings, account } = st;

  return {
    usersDataKeyCount:
      users && typeof users === "object"
        ? Object.keys(users).filter((k) => k !== "actions").length
        : 0,
    applicationSettingsKeyCount:
      applicationSettings && typeof applicationSettings === "object"
        ? Object.keys(applicationSettings).filter((k) => k !== "actions").length
        : 0,
    linkedCharacterCount: Array.isArray(account?.characters)
      ? account.characters.length
      : 0,
    corporationCount: Array.isArray(account?.corporations)
      ? account.corporations.length
      : 0,
    isLoggedIn: Boolean(account?.isLoggedIn),
  };
}

/**
 * What the edit session held when something threw.
 *
 * Read from the store rather than taken as an argument: this is asked for at the
 * moment of an error, and a page that carried the session down to the error
 * boundary to have it ready is the prop-drilled page these hints describe.
 *
 * @returns {object}
 */
export function getSentryEditJobStateHints() {
  const session = useUsersStore.getState().editSession;
  if (!session) {
    return { editJobState: "missing" };
  }

  const openJob = jobDraftNow();
  return {
    editJobStepIndex:
      typeof openJob?.jobStatus === "number" ? openJob.jobStatus : null,
    editJobId: openJob?.jobID ?? null,
    jobModified: hasChanges(session.draft),
    isLoading: Boolean(session.isLoading),
    temporaryChildJobsCount: Object.keys(session.temporaryChildJobs ?? {})
      .length,
    hasEsiDataToLink: Boolean(session.esiDataToLink),
    hasParentChildToEdit: Boolean(session.parentChildToEdit),
    includedInGroup: Boolean(openJob?.includedInGroup),
    isReadyToSell: Boolean(openJob?.isReadyToSell),
  };
}
