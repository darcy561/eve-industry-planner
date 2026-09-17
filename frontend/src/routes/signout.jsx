import { createFileRoute, redirect } from "@tanstack/react-router";
import { queryClient } from "../queryClient.js";
import { logoutPlannerSession } from "../Functions/Auth/sessionClient.js";
import { getTabPlannerRefreshToken } from "../Functions/Auth/tabSessionStorage.js";
import { clearPlannerAuthCookiesClientSide } from "../Functions/Auth/plannerAuthCookies.js";
import { disconnectWebsocket } from "../WebSocket/websocketClient.js";
import { clearInboundJobDocumentCoalesce } from "../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import useUsersStore from "../Zustand/usersStore";
import esiCredentials from "../Functions/Auth/esiCredentials/provider.js";

function clearClientSessionState() {
  const { resetJobDataStore } = useUsersStore.getState().jobData.actions;
  const { resetApplicationSettingsStore } =
    useUsersStore.getState().applicationSettings.actions;
  const { resetAccountStore } = useUsersStore.getState().account.actions;
  const { resetWorldDataStore } = useUsersStore.getState().worldData.actions;
  const { resetPlannerSettingsStore } =
    useUsersStore.getState().plannerSettings.actions;
  const { resetActivePlannerStore } =
    useUsersStore.getState().activePlanner.actions;

  // Drop module-level WS coalesce queues before zustand resets; pending job upserts can
  // still flush and repopulate job data after `resetJobDataStore` if not cleared.
  clearInboundJobDocumentCoalesce();
  // Clear session first so in-flight account GETs (e.g. loadAccountDocuments) cannot
  // re-merge application_settings after we clear them in the same tick.
  resetAccountStore();
  resetJobDataStore();
  resetApplicationSettingsStore();
  resetPlannerSettingsStore();
  resetActivePlannerStore();
  resetWorldDataStore();
  clearPlannerAuthCookiesClientSide();
  // Held ESI access tokens live outside the store, so no slice reset drops them.
  esiCredentials.reset();
}

function clearBrowserStorage() {
  sessionStorage.clear();
  localStorage.removeItem("Auth");
}

export const Route = createFileRoute("/signout")({
  staticData: { audience: "transient" },
  // Teardown runs as a navigation guard rather than a mounted component, so
  // signing out never renders a page of its own.
  beforeLoad: async () => {
    let serverLogoutFailed = false;
    try {
      disconnectWebsocket();
      await logoutPlannerSession(getTabPlannerRefreshToken());
    } catch (error) {
      console.error("Signout error:", error);
      serverLogoutFailed = true;
    } finally {
      clearClientSessionState();
      queryClient.clear();
      clearBrowserStorage();
    }

    // A failed server logout reloads rather than routing: whatever state made
    // it fail cannot survive into the next session.
    if (serverLogoutFailed) {
      window.location.href = "/";
      return;
    }

    throw redirect({ to: "/" });
  },
});
