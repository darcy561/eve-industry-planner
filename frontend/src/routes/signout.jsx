import { createFileRoute } from '@tanstack/react-router'
import { getAuth, signOut } from "firebase/auth";
import { logoutServerSession } from "../Functions/Auth/serverTokens";
import useUsersStore from '../Zustand/usersStore'
import { LoadingPage } from '../Components/loadingPage'
import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
function SignoutComponent() {
  const navigate = useNavigate();
  useEffect(() => {
    async function performSignout() {
      const auth = getAuth();

      const firebaseListeners = useUsersStore.getState().users.firebaseListeners;
      const { resetUsersSettingsStore } = useUsersStore.getState().users.actions;
      const { resetJobDataStore } = useUsersStore.getState().jobData.actions;
      const { resetApplicationSettingsStore } = useUsersStore.getState().applicationSettings.actions;
      const { resetAccountStore } = useUsersStore.getState().account.actions;
      const { resetWorldDataStore } = useUsersStore.getState().worldData.actions;
      const { refreshToken } = useUsersStore.getState().account;

      try {
        await logoutServerSession(refreshToken);

        // Clean up Firebase listeners
        firebaseListeners.forEach(({ unsubscribe }) => {
          unsubscribe();
        });

        // Clear all stores
        resetUsersSettingsStore();
        resetJobDataStore();
        resetApplicationSettingsStore();
        resetAccountStore();
        resetWorldDataStore();

        // Clear storage
        sessionStorage.clear();
        localStorage.removeItem("Auth");
        localStorage.removeItem("originalPath");

        // Sign out from Firebase
        await signOut(auth);

        // Navigate to home page
        navigate({ to: "/" });

      } catch (error) {
        console.error("Signout error:", error);

        // If there's an error, hard refresh the page to ensure clean state
        window.location.href = "/";
      }
    }

    performSignout();
  }, [navigate]);

  return <LoadingPage variant="route" />;
}

export const Route = createFileRoute('/signout')({
  component: SignoutComponent,
})