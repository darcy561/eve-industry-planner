import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from "@tanstack/react-query";
import { logoutServerSession } from "../Functions/Auth/serverTokens";
import { disconnectRealtime } from "../Realtime/realtimeClient.js";
import { clearInboundJobDocumentCoalesce } from "../Functions/Debounce/inboundJobDocumentsCoalesce.js";
import useUsersStore from '../Zustand/usersStore'
import { LoadingPage } from '../Components/loadingPage'
import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'

function clearClientSessionState() {
  const { resetUsersSettingsStore } = useUsersStore.getState().users.actions;
  const { resetJobDataStore } = useUsersStore.getState().jobData.actions;
  const { resetApplicationSettingsStore } = useUsersStore.getState()
    .applicationSettings.actions;
  const { resetAccountStore } = useUsersStore.getState().account.actions;
  const { resetWorldDataStore } = useUsersStore.getState().worldData.actions;

  // Drop module-level WS coalesce queues before zustand resets; pending job upserts can
  // still flush and repopulate job data after `resetJobDataStore` if not cleared.
  clearInboundJobDocumentCoalesce();
  // Clear session first so in-flight account GETs (e.g. syncAccountDocumentsFromServer) cannot
  // re-merge application_settings after we clear them in the same tick.
  resetAccountStore();
  resetUsersSettingsStore();
  resetJobDataStore();
  resetApplicationSettingsStore();
  resetWorldDataStore();
}

function SignoutComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    async function performSignout() {
      const { refreshToken } = useUsersStore.getState().account;

      try {
        disconnectRealtime();
        await logoutServerSession(refreshToken);

        clearClientSessionState();
        queryClient.clear();

        // Clear storage
        sessionStorage.clear();
        localStorage.removeItem("Auth");
        localStorage.removeItem("originalPath");

        // Navigate to home page
        navigate({ to: "/" });

      } catch (error) {
        console.error("Signout error:", error);

        clearClientSessionState();
        queryClient.clear();
        sessionStorage.clear();
        localStorage.removeItem("Auth");
        localStorage.removeItem("originalPath");
        window.location.href = "/";
      }
    }

    performSignout();
  }, [navigate, queryClient]);

  return <LoadingPage variant="route" />;
}

export const Route = createFileRoute('/signout')({
  component: SignoutComponent,
})