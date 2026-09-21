import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import PageTransition, { usePageKey } from "./pageTransition";

function view(key, body) {
  return <PageTransition contentKey={key}>{body}</PageTransition>;
}

describe("swapping full-page content", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  // A page being left must unmount at once: holding it through a fade keeps its
  // effects running and its document locks held.
  test("the outgoing content is gone as soon as the key changes", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    expect(screen.getByText("page a")).toBeTruthy();

    rerender(view("/b", <div>page b</div>));

    expect(screen.queryByText("page a")).toBeNull();
    expect(screen.getByText("page b")).toBeTruthy();
  });

  // Opening a child job from an open one changes a param, not the page; the
  // route keeps its mount rather than tearing down and re-running its setup.
  test("content changing under the same key is not remounted", () => {
    const mounted = vi.fn();
    function Child({ label }) {
      useEffect(() => mounted, []);
      return <div>{label}</div>;
    }

    const { rerender } = render(view("/a", <Child label="first" />));
    rerender(view("/a", <Child label="second" />));

    expect(screen.getByText("second")).toBeTruthy();
    expect(mounted).not.toHaveBeenCalled();
  });

  // The arriving page must not be the thing that gets faded out. Sharing a
  // surface across the swap hands it the opacity the page before it left
  // behind, so the only route to a hidden frame is to animate the new page
  // away and bring it back — which shows it, takes it away, and returns it.
  test("the incoming content is not the thing being faded", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    const leaving = screen.getByText("page a").parentElement;

    rerender(view("/b", <div>page b</div>));
    const arriving = screen.getByText("page b").parentElement;

    expect(arriving).not.toBe(leaving);
    expect(arriving.style.opacity).not.toBe("0");
  });

  test("the incoming content ends up visible", () => {
    const { rerender } = render(view("/a", <div>page a</div>));
    rerender(view("/b", <div>page b</div>));

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText("page b").parentElement.style.opacity).toBe("1");
  });
});

const routerState = vi.hoisted(() => ({ current: { matches: [] } }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }) => select(routerState.current),
}));

describe("the page key", () => {
  function keyFor(matches, isMaintenanceMode = false) {
    routerState.current = { matches };
    let seen;
    function Probe() {
      seen = usePageKey(isMaintenanceMode);
      return null;
    }
    render(<Probe />);
    return seen;
  }

  // Opening a child job from an open one changes the path but not the page.
  test("is the route pattern, so a param change is not a page change", () => {
    expect(keyFor([{ routeId: "/editjob/$jobID" }])).toBe("/editjob/$jobID");
  });

  test("maintenance overrides the route", () => {
    expect(keyFor([{ routeId: "/dashboard" }], true)).toBe("maintenance");
  });

  test("survives a router state with no matches", () => {
    expect(keyFor([])).toBe("");
  });
});
