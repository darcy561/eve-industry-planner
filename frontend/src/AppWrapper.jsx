import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import * as Sentry from "@sentry/react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { useEffect, useMemo, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Lazy load React Query DevTools (only in dev, tree-shaken in production)
const ReactQueryDevtools =
  import.meta.env.MODE === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((res) => ({
          default: res.ReactQueryDevtools,
        }))
      )
    : null;

export function AppWrapper() {
  const queryClient = useMemo(() => new QueryClient(), []);

  // Create the router
  const router = useMemo(() => createRouter({ routeTree }), []);

  Sentry.init({
    dsn: import.meta.env.SENTRY_DSN,

    environment: import.meta.env.MODE,

    release: import.meta.env.VITE_APP_VERSION || "development",

    beforeSend(event) {
      if (import.meta.env.MODE === "development") {
        return null;
      }
      return event;
    },

    ignoreErrors: [
      "Network request failed",
      "Failed to fetch",
      "NetworkError",

      "ResizeObserver loop limit exceeded",
      "Script error",
    ],

    sampleRate: 1.0,
  });

  useEffect(() => {
    const mode = import.meta.env.MODE;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        Sentry.setUser({
          uid: user.uid,
        });
      } else {
        Sentry.setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DndProvider backend={HTML5Backend}>
          <RouterProvider router={router} />
        </DndProvider>
      </LocalizationProvider>
      {import.meta.env.MODE === "development" && ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
