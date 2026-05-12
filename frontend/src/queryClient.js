import { QueryClient } from "@tanstack/react-query";

/**
 * Shared React Query client for the app shell and modules outside React (Zustand actions, guards).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
    },
  },
});
