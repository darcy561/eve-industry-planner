import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Single router instance for Sentry TanStack integration (init) and {@link RouterProvider}. */
export const appRouter = createRouter({ routeTree });
