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

/**
 * A router over the app's **real** route tree.
 *
 * Tests used to build a tree of their own, which meant a link could point at a route
 * the app does not have and still pass. Everything here matches, guards and loads what
 * the app would.
 *
 * @param {string} [initialPath]
 */
export function testRouter(initialPath = "/") {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

/**
 * Renders `ui` with router context but without rendering any route, for a component
 * that holds links or navigates. A theme comes with it: `useMediaQuery` reads
 * breakpoints off one, so a responsive component cannot render without it.
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
  // No route is rendered, so `ui` stays put across a navigation: the router is how a
  // test sees where a click went.
  return { ...rendered, router };
}

/**
 * Walks the app to `url` through the real router — matching, the root guard, then the
 * route's own loader — and reports where a reader ends up.
 *
 * Nothing is rendered, so no page component is pulled in; what this covers is the
 * routing layer itself, which is the part that decides what a reader may see and what
 * has to be there before they see it.
 *
 * `state` is history state, which a URL cannot carry — a route that only acts when the
 * app sent the reader there reads it, so a test has to be able to arrive both ways. It
 * costs a navigation: the router starts elsewhere and moves, because history state
 * belongs to a navigation rather than to an initial entry.
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
    // A loader that threw `notFound()` leaves the match saying so rather than erroring.
    isNotFound: Boolean(
      leaf?.status === "notFound" ||
      leaf?.globalNotFound ||
      leaf?._forcedNotFound,
    ),
    error: leaf?.error,
  };
}

/**
 * Mounts the app at `url` and renders whatever a reader would be looking at, under the
 * app's own router options — its pending screen, its not-found page, its preloading.
 *
 * The root route's component is `App`, which reaches for websockets and queries, so a
 * test using this mocks `src/App` with something that renders an `Outlet`.
 *
 * @param {string} url
 * @returns {Promise<import("@testing-library/react").RenderResult & {router: Object}>}
 */
export async function renderRoute(url) {
  const router = createRouter({
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
