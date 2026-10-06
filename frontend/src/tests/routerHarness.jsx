import { afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import {
  createMemoryHistory,
  createRouter,
  RouterContextProvider,
  RouterProvider,
} from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen.js";
import { appRouterOptions } from "../appRouter.jsx";

const theme = createTheme();
const routersInUse = new Set();

afterEach(async () => {
  const routers = [...routersInUse];
  routersInUse.clear();
  await Promise.all(
    routers.map((router) =>
      vi.waitFor(
        () => {
          if (router.state.status !== "idle") throw new Error("still loading");
        },
        { timeout: 15000 },
      ),
    ),
  );
});

/**
 * Builds a router held until its navigation settles, so a route still loading never outlives the
 * test that started it.
 *
 * @param {Object} options - What `createRouter` takes
 */
function heldRouter(options) {
  const router = createRouter(options);
  routersInUse.add(router);
  return router;
}

/**
 * A router over the app's real route tree, so a link to a route the app does not have fails.
 *
 * @param {string} [initialPath]
 */
export function testRouter(initialPath = "/") {
  return heldRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

/**
 * Renders `ui` with router context and a theme but no route, for a component that holds links or
 * navigates; the returned router is how a test sees where a click went.
 *
 * @param {React.ReactNode} ui
 * @param {Object} [options]
 * @param {string} [options.path] - The location the component believes it is on.
 * @returns {Promise<import("@testing-library/react").RenderResult & {router: Object}>}
 */
export async function renderWithRouter(ui, { path = "/" } = {}) {
  const router = testRouter(path);
  await router.load();

  const rendered = render(
    <RouterContextProvider router={router}>
      <ThemeProvider theme={theme}>{ui}</ThemeProvider>
    </RouterContextProvider>,
  );
  return { ...rendered, router };
}

/**
 * Walks the app to `url` through the real router, rendering nothing, and reports where a reader
 * ends up; `state` arrives by a navigation, since a URL cannot carry history state.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {Record<string, unknown>} [options.state] - History state to arrive with.
 * @returns {Promise<{router: Object, pathname: string, search: Object, routeId: string|undefined, isNotFound: boolean, error: unknown}>}
 */
export async function enterRoute(url, { state } = {}) {
  const router = testRouter(state ? "/" : url);
  await router.load();
  if (state) {
    await router.navigate({ to: url, state });
    await router.invalidate();
  }

  const matches = router.state.matches;
  const leaf = matches.at(-1);

  return {
    router,
    pathname: router.state.location.pathname,
    search: router.state.location.search,
    routeId: leaf?.routeId,
    isNotFound: Boolean(
      leaf?.status === "notFound" ||
      leaf?.globalNotFound ||
      leaf?._forcedNotFound,
    ),
    error: leaf?.error,
  };
}

/**
 * Mounts the app at `url` under its own router options and renders what a reader would see; the
 * root component is `App`, so a test mocks `src/App` with something that renders an `Outlet`.
 *
 * @param {string} url
 * @returns {Promise<import("@testing-library/react").RenderResult & {router: Object}>}
 */
export async function renderRoute(url) {
  const router = heldRouter({
    ...appRouterOptions,
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();

  const rendered = render(
    <ThemeProvider theme={theme}>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return { ...rendered, router };
}
