import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { PlannerDnDProvider } from "./Context/PlannerDnDProvider";
import { setUser } from "@sentry/react";
import { useEffect, lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient.js";
import { RouterProvider } from "@tanstack/react-router";
import { appRouter } from "./appRouter";
import { enableGa4WebVitals } from "./analytics/googleAnalytics";
import useUsersStore from "./Zustand/usersStore";

// Lazy load React Query DevTools when ENVIRONMENT=development (see vite.config define + root .env)
const ReactQueryDevtools =
  import.meta.env.ENVIRONMENT === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((res) => ({
          default: res.ReactQueryDevtools,
        }))
      )
    : null;

export function AppWrapper() {
  const accountID = useUsersStore((state) => state.account.accountID);

  useEffect(() => {
    if (accountID) {
      const id = String(accountID);
      // Sentry often labels events as "Anonymous" when only `id` is set; `username` drives display.
      setUser({ id, username: id });
    } else {
      setUser(null);
    }
  }, [accountID]);

  useEffect(() => {
    enableGa4WebVitals();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <PlannerDnDProvider>
          <RouterProvider router={appRouter} />
        </PlannerDnDProvider>
      </LocalizationProvider>
      {import.meta.env.ENVIRONMENT === "development" && ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
