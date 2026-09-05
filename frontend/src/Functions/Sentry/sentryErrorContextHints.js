import useUsersStore from "../../Zustand/usersStore";

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
 * @param {object | null | undefined} state - Edit job reducer state
 */
export function getSentryEditJobStateHints(state) {
  if (!state || typeof state !== "object") {
    return { editJobState: "missing" };
  }
  const aj = state.activeJob;
  return {
    editJobStepIndex: typeof aj?.jobStatus === "number" ? aj.jobStatus : null,
    editJobId: aj?.jobID ?? null,
    jobModified: Boolean(state.jobModified),
    isLoading: Boolean(state.isLoading),
    temporaryChildJobsCount: Array.isArray(state.temporaryChildJobs)
      ? state.temporaryChildJobs.length
      : 0,
    hasEsiDataToLink: Boolean(state.esiDataToLink),
    hasParentChildToEdit: Boolean(state.parentChildToEdit),
    includedInGroup: Boolean(aj?.includedInGroup),
    isReadyToSell: Boolean(aj?.isReadyToSell),
  };
}
